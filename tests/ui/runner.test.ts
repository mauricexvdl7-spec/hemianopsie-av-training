import { describe, it, expect } from 'vitest';
import { runTrial } from '../../src/ui/runner';
import { levelParams } from '../../src/core/stimulus';
import { samplePlan } from '../helpers/plans';
import { fakeDeps } from '../helpers/fakeRunner';

const ISO = '2026-10-11T10:00:00.000Z';
const T0 = 1500; // waitMs des Beispielplans, Start bei 0

describe('runTrial', () => {
  it('Antwort 400 ms nach t0 → Treffer, Ton einmal geplant', async () => {
    const f = fakeDeps();
    const plan = samplePlan();
    const p = runTrial(plan, f.deps, ISO);
    f.respondAt(T0 + 400);
    f.advanceTo(T0 + 700);
    const r = await p;
    expect(r.outcome).toBe('hit');
    expect(r.rtMs).toBe(400);
    expect(f.deps.scheduleSound).toHaveBeenCalledTimes(1);
    expect(f.deps.scheduleSound).toHaveBeenCalledWith(plan, T0);
    expect(r.startedAtIso).toBe(ISO);
    expect(r.contrast).toBeCloseTo(levelParams(6).contrast);
    expect(r.sigmaDeg).toBe(levelParams(6).sigmaDeg);
    expect(r.stimulusPx!.x).toBeLessThan(800);
  });

  it('Fenster kürzer als der Reiz (Plateau 1500 + Fenster 1500): Tipp bei noch sichtbarem Licht ist ein Treffer', async () => {
    const f = fakeDeps();
    const p = runTrial(samplePlan({ plateauMs: 1500, responseWindowMs: 1500 }), f.deps, ISO);
    f.respondAt(T0 + 1700); // Reiz dauert bis T0 + 1800, das Antwortfenster allein nur bis T0 + 1500
    f.advanceTo(T0 + 2000);
    const r = await p;
    expect(r.outcome).toBe('hit');
    expect(r.rtMs).toBe(1700);
  });

  it('Fenster kürzer als der Reiz: Tipp ohne Reiz bei noch laufendem Fenster ist ein falscher Alarm', async () => {
    const f = fakeDeps();
    const plan = samplePlan({ kind: 'catch', pos: null, gridPointId: null, level: null, sound: 'none', plateauMs: 1500, responseWindowMs: 1500 });
    const p = runTrial(plan, f.deps, ISO);
    f.respondAt(T0 + 1700);
    f.advanceTo(T0 + 2000);
    expect((await p).outcome).toBe('falseAlarm');
  });

  it('Treffer endet erst nach dem Ausblenden', async () => {
    const f = fakeDeps();
    let done = false;
    const p = runTrial(samplePlan(), f.deps, ISO).then((r) => {
      done = true;
      return r;
    });
    f.respondAt(T0 + 300);
    f.advanceTo(T0 + 550);
    await Promise.resolve();
    expect(done).toBe(false);
    f.advanceTo(T0 + 620);
    await p;
    expect(done).toBe(true);
  });

  it('keine Antwort → verpasst nach Ablauf des Fensters', async () => {
    const f = fakeDeps();
    const p = runTrial(samplePlan(), f.deps, ISO);
    f.advanceTo(T0 + 2100);
    const r = await p;
    expect(r.outcome).toBe('miss');
    expect(r.rtMs).toBeNull();
  });

  it('ohne Reiz: Tipp in der Wartezeit → Vorwegnahme, kein falscher Alarm', async () => {
    const f = fakeDeps();
    const p = runTrial(samplePlan({ kind: 'catch', pos: null, gridPointId: null, level: null, sound: 'none' }), f.deps, ISO);
    f.respondAt(T0 - 600);
    f.advanceTo(T0 + 2100);
    expect((await p).outcome).toBe('anticipation');
  });

  it('Antwort 100 ms vor t0 → vorweggenommen', async () => {
    const f = fakeDeps();
    const p = runTrial(samplePlan(), f.deps, ISO);
    f.respondAt(T0 - 100);
    f.advanceTo(T0 + 700);
    const r = await p;
    expect(r.outcome).toBe('anticipation');
    expect(r.rtMs).toBe(-100);
  });

  it('ohne Reiz und ohne Antwort → korrekt zurückgewiesen, nie ein Lichtfleck', async () => {
    const f = fakeDeps();
    const p = runTrial(samplePlan({ kind: 'catch', pos: null, gridPointId: null, level: null, sound: 'none' }), f.deps, ISO);
    f.advanceTo(T0 + 2100);
    const r = await p;
    expect(r.outcome).toBe('correctRejection');
    expect(f.draws.every((d) => d.state.blob === null)).toBe(true);
    expect(f.deps.scheduleSound).not.toHaveBeenCalled();
    expect(r.contrast).toBeNull();
    expect(r.stimulusPx).toBeNull();
  });

  it.each(['hidden', 'resize'] as const)('Abbruch %s → aborted, Fleck sofort weg', async (reason) => {
    const f = fakeDeps();
    const p = runTrial(samplePlan(), f.deps, ISO);
    f.advanceTo(T0 + 100);
    f.abort(reason);
    f.advanceTo(T0 + 120);
    const r = await p;
    expect(r.outcome).toBe('aborted');
    expect(r.abortReason).toBe(reason);
    expect(f.draws.at(-1)!.state.blob).toBeNull();
  });

  it.each(['hidden', 'resize', 'stall'] as const)('Abbruch %s → geplanter Ton wird abgebrochen (Ton nie länger als 1 s nach dem Abbruch)', async (reason) => {
    const f = fakeDeps();
    const p = runTrial(samplePlan({ soaMs: -200 }), f.deps, ISO);
    f.advanceTo(T0 - 100); // Ton ist schon geplant (Beginn T0 - 200), Licht noch nicht sichtbar
    expect(f.deps.scheduleSound).toHaveBeenCalledTimes(1);
    if (reason === 'stall') f.jumpTo(T0 + 1000);
    else f.abort(reason);
    expect((await p).outcome).toBe('aborted');
    expect(f.deps.cancelSound).toHaveBeenCalledTimes(1);
  });

  it('normales Ende (Treffer, verpasst, Vorwegnahme) bricht keinen Ton ab', async () => {
    for (const respondAt of [T0 + 400, null, T0 - 100]) {
      const f = fakeDeps();
      const p = runTrial(samplePlan(), f.deps, ISO);
      if (respondAt !== null) f.respondAt(respondAt);
      f.advanceTo(T0 + 2100);
      await p;
      expect(f.deps.cancelSound).not.toHaveBeenCalled();
    }
  });

  it('Hüllkurve im gezeichneten Fleck', async () => {
    const f = fakeDeps();
    const p = runTrial(samplePlan(), f.deps, ISO);
    f.advanceTo(T0 + 2100);
    await p;
    const at = (t: number) => f.draws.find((d) => d.t === t)!.state.blob!;
    expect(at(T0 + 75).gain).toBeCloseTo(0.5);
    expect(at(T0 + 300).gain).toBe(1);
    expect(f.draws.find((d) => d.t === T0 - 5)!.state.blob).toBeNull();
    expect(f.draws.every((d) => d.state.fixation)).toBe(true);
  });

  it('eingefrorene Frames während Reiz oder Antwortfenster → abgebrochen (stall), nicht verpasst', async () => {
    const f = fakeDeps();
    const p = runTrial(samplePlan(), f.deps, ISO);
    f.advanceTo(T0 + 50);
    f.jumpTo(T0 + 2500);
    const r = await p;
    expect(r.outcome).toBe('aborted');
    expect(r.abortReason).toBe('stall');
  });

  it('eine Lücke nur in der Wartezeit stört nicht', async () => {
    const f = fakeDeps();
    const p = runTrial(samplePlan(), f.deps, ISO);
    f.advanceTo(100);
    f.jumpTo(T0 - 200);
    f.advanceTo(T0 + 2100);
    const r = await p;
    expect(r.outcome).toBe('miss');
  });

  it('speichert, ob der Ton wirklich gespielt wurde', async () => {
    const f = fakeDeps();
    (f.deps.scheduleSound as unknown as { mockReturnValue(v: boolean): void }).mockReturnValue(false);
    const p = runTrial(samplePlan(), f.deps, ISO);
    f.advanceTo(T0 + 2100);
    expect((await p).soundPlayed).toBe(false);

    const g = fakeDeps();
    (g.deps.scheduleSound as unknown as { mockReturnValue(v: boolean): void }).mockReturnValue(true);
    const q = runTrial(samplePlan(), g.deps, ISO);
    g.advanceTo(T0 + 2100);
    expect((await q).soundPlayed).toBe(true);

    const h = fakeDeps();
    const r = runTrial(samplePlan({ sound: 'none' }), h.deps, ISO);
    h.advanceTo(T0 + 2100);
    expect((await r).soundPlayed).toBe(false);
  });
});
