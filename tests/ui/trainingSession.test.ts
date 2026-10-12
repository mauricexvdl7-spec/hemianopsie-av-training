import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { makeGeometry } from '../../src/core/geometry';
import { createRng } from '../../src/core/rng';
import { createControllerState } from '../../src/core/controller';
import { DEFAULT_GRID } from '../../src/core/blocks';
import { openDb } from '../../src/store/db';
import { runTrainingSession, startTrainingSession } from '../../src/ui/session';

/** Feste Durchgangszahl dieser Tests (die App läuft nach Zeit). */
const SESSION_TRIALS = 60;
import type { RunnerDeps } from '../../src/ui/runner';
import { fakeDeps } from '../helpers/fakeRunner';
import { sampleRecord } from '../helpers/plans';

// Schutzgrenze pro Test einstellbar (Standard unverändert 800).
const limits = vi.hoisted(() => ({ max: 800 }));
vi.mock('../../src/core/schedule', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/core/schedule')>();
  return {
    ...orig,
    get MAX_TRIALS_PER_SESSION() {
      return limits.max;
    },
  };
});

let n = 0;
const geometry = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1200, 800);

/**
 * Fake-Umgebung, die selbständig antwortet: Sobald ein Reiz sichtbar wird, folgt 400 ms später ein Tipp (Treffer).
 * Durchgänge ohne Reiz bleiben unbeantwortet. Im Durchgang `abortAt` (0-basiert) wird die App ausgeblendet.
 */
function autoDeps(abortAt: number | null): RunnerDeps {
  const f = fakeDeps();
  let trial = -1;
  let responded = false;
  return {
    ...f.deps,
    geometry: () => geometry,
    frame: (cb) => {
      f.deps.frame(cb);
      queueMicrotask(() => f.advanceTo(f.now + 5));
    },
    draw: (state) => {
      f.deps.draw(state);
      if (state.blob && !responded) {
        responded = true;
        const t = f.now + 400;
        queueMicrotask(() => f.respondAt(t));
      }
    },
    input: {
      arm: (cb) => {
        f.deps.input.arm(cb);
        trial++;
        responded = false;
        if (abortAt === trial) queueMicrotask(() => f.abort('hidden'));
      },
      disarm: f.deps.input.disarm,
    },
  };
}

function setup(over: Partial<Parameters<typeof runTrainingSession>[0]> = {}) {
  return (async () => {
    const db = await openDb(`training-db-${n++}`);
    let clock = Date.UTC(2026, 9, 11, 10, 0, 0);
    const ticks: number[] = [];
    const args = {
      db,
      deps: autoDeps(null),
      geometry,
      responseWindowMs: 2000,
      trials: SESSION_TRIALS,
      sessionId: 'sess-1',
      // Jeder Aufruf der Uhr vergeht eine Sekunde: Beginn und Ende sind unterscheidbar.
      now: () => {
        const t = (clock += 1000);
        ticks.push(t);
        return new Date(t);
      },
      rng: createRng(7),
      ...over,
    };
    return { db, args, ticks };
  })();
}

describe('runTrainingSession', () => {
  it('60 Durchgänge: Records, Treppenwerte, Controller, Snapshot und Sitzung', async () => {
    const { db, args, ticks } = await setup();
    const res = await runTrainingSession(args);
    expect(res.aborted).toBe(false);
    expect(res.records).toHaveLength(SESSION_TRIALS);

    const saved = await db.listTrials('sess-1');
    expect(saved).toHaveLength(60);
    const left = saved.filter((r) => r.kind === 'left');
    expect(left.length).toBeGreaterThan(0);
    for (const r of left) {
      expect(r.outcome).toBe('hit');
      expect(r.stairBefore).not.toBeNull();
      expect(r.stairAfter).not.toBeNull();
    }
    // Rechte Durchgänge und Durchgänge ohne Reiz verändern die Treppe nicht.
    for (const r of saved.filter((x) => x.kind !== 'left')) expect(r.stairBefore).toBeNull();

    const controller = await db.getController();
    expect(controller?.sessionCount).toBe(1);

    const snaps = await db.listMapSnapshots();
    expect(snaps.map((s) => s.id)).toEqual(['sess-1:sessionEnd']);
    expect(snaps[0]!.reason).toBe('sessionEnd');
    expect(snaps[0]!.sessionId).toBe('sess-1');

    const sessions = await db.listSessions();
    expect(sessions).toHaveLength(1);
    const s = sessions[0]!;
    expect(s.endedAtIso).not.toBeNull();
    expect(s.trialCount).toBe(60);
    expect(s.stage).toBe('1');
    expect(s.summary).not.toBeNull();
    expect(s.summary!.stage).toBe('1');
    expect(s.summary!.leftHitRate).toBe(1);
    // Dauer = aktive Laufzeit: Uhr am Anfang des Laufs (2. Aufruf, nach dem Sitzungsbeginn) bis zu seinem Ende
    // (vorletzter Aufruf; der letzte ist das Sitzungsende). Der Sitzungsbeginn davor zählt nicht.
    const minutes = (ticks.at(-2)! - ticks[1]!) / 60000;
    expect(s.summary!.durationMin).toBeCloseTo(minutes, 6);
    expect(s.summary!.durationMin).toBeGreaterThan(0);
    expect(s.summary!.durationMin).toBeLessThan((Date.parse(s.endedAtIso!) - Date.parse(s.startedAtIso)) / 60000);
  });

  it('Abbruch im 5. Durchgang: aborted, Controller gespeichert, Sitzung nicht beendet', async () => {
    const { db, args } = await setup({ deps: autoDeps(4) });
    const res = await runTrainingSession(args);
    expect(res.aborted).toBe(true);
    expect(res.records).toHaveLength(5);
    expect(res.records[4]!.outcome).toBe('aborted');

    const controller = await db.getController();
    expect(controller).not.toBeNull();
    expect(controller!.sessionCount).toBe(0);
    expect(await db.listMapSnapshots()).toHaveLength(0);
    expect((await db.listTrials('sess-1')).length).toBe(5);
    const s = (await db.listSessions())[0]!;
    expect(s.endedAtIso).toBeNull();
    expect(s.summary).toBeNull();
    expect(s.trialCount).toBe(5);
  });

  it('Abbruch sichert den bisherigen Fortschritt von Karte und Treppe', async () => {
    const { db, args } = await setup({ deps: autoDeps(10) });
    await runTrainingSession(args);
    const saved = (await db.listTrials('sess-1')).filter((r) => r.stairAfter !== null);
    expect(saved.length).toBeGreaterThan(0);
    const controller = (await db.getController())!;
    // Mindestens eine Treppe hat sich bewegt (Treffer → nach zwei Treffern eine Stufe weiter).
    const levels = Object.values(controller.stairs).map((st) => st.level);
    expect(levels.some((l) => l !== 6)).toBe(true);
    // Die Karte enthält Evidenz.
    expect(controller.map.logLik.some((row) => row.some((v) => v !== 0))).toBe(true);
  });

  it('Fortsetzen nach Abbruch: derselbe Planer, am Ende genau eine Sitzung und ein Snapshot', async () => {
    const { db, args } = await setup({ deps: autoDeps(4) });
    const handle = await startTrainingSession(args);
    const first = await handle.run(args.deps);
    expect(first.aborted).toBe(true);
    expect(first.records).toHaveLength(5);

    const second = await handle.run(autoDeps(null));
    expect(second.aborted).toBe(false);
    // 4 gewertete Durchgänge zählen schon; der abgebrochene wird nicht mitgezählt, es fehlen noch 56.
    expect(second.records).toHaveLength(SESSION_TRIALS - 4);
    await handle.finish();

    const all = await db.listTrials('sess-1');
    expect(all.filter((r) => r.outcome !== 'aborted')).toHaveLength(SESSION_TRIALS);
    const controller = (await db.getController())!;
    expect(controller.sessionCount).toBe(1);
    expect((await db.listMapSnapshots()).map((s) => s.id)).toEqual(['sess-1:sessionEnd']);
    const s = (await db.listSessions())[0]!;
    expect(s.endedAtIso).not.toBeNull();
    expect(s.trialCount).toBe(all.length);
  });

  it('Dauer zählt nur die aktive Laufzeit: Abbruch, lange Pause und Fortsetzen (Pause und Hintergrund zählen nicht)', async () => {
    let offsetMs = 0;
    const base = Date.UTC(2026, 9, 11, 10, 0, 0);
    // Jeder Durchgang dauert 10 s (Uhr springt beim Speichern), zwischen den Läufen vergehen 14 Minuten.
    const { db, args } = await setup({
      now: () => new Date(base + offsetMs),
      onTrial: () => {
        offsetMs += 10_000;
      },
      deps: autoDeps(2),
      trials: 5,
    });
    const handle = await startTrainingSession(args);
    offsetMs += 60_000; // Sitzung ist angelegt, die Person tippt noch nicht los (zählt nicht)
    const first = await handle.run(args.deps);
    expect(first.aborted).toBe(true);
    expect(first.records).toHaveLength(3); // 2 gewertete + 1 abgebrochen = 30 s aktiv
    offsetMs += 14 * 60_000; // App im Hintergrund, Pause-Ansicht, Kaffee
    const second = await handle.run(autoDeps(null));
    expect(second.aborted).toBe(false);
    expect(second.records).toHaveLength(3); // 3 weitere Durchgänge = 30 s aktiv
    offsetMs += 5 * 60_000; // Zusammenfassung wird lange angezeigt, bevor finish() läuft
    await handle.finish();

    const s = (await db.listSessions())[0]!;
    expect(s.summary!.durationMin).toBeCloseTo(1, 6);
    // Die Wanduhr lag dagegen bei über 20 Minuten.
    expect((Date.parse(s.endedAtIso!) - Date.parse(s.startedAtIso)) / 60000).toBeGreaterThan(20);
  });

  it('gespeicherter Controller wird weitergeführt (Sitzungszähler 2)', async () => {
    const { db, args } = await setup();
    await runTrainingSession({ ...args, trials: 10 });
    await runTrainingSession({ ...args, trials: 10, sessionId: 'sess-2', deps: autoDeps(null), rng: createRng(8) });
    expect((await db.getController())!.sessionCount).toBe(2);
    expect((await db.listMapSnapshots()).map((s) => s.id).sort()).toEqual(['sess-1:sessionEnd', 'sess-2:sessionEnd']);
  });

  it('anderes Raster: alte Karte als gridChanged gesichert, neue Karte angelegt', async () => {
    const { db, args } = await setup();
    const other = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 700, 800);
    const old = createControllerState(other);
    await db.saveController(old);
    await runTrainingSession({ ...args, trials: 5 });
    const snaps = await db.listMapSnapshots();
    expect(snaps.map((s) => s.id).sort()).toEqual(['sess-1:gridChanged', 'sess-1:sessionEnd']);
    const changed = snaps.find((s) => s.reason === 'gridChanged')!;
    expect(changed.gridSignature).toBe(old.gridSignature);
    expect(changed.map.points).toHaveLength(old.map.points.length);
    const controller = (await db.getController())!;
    expect(controller.gridSignature).not.toBe(old.gridSignature);
    expect(controller.sessionCount).toBe(old.sessionCount + 1);
  });

  describe('zeitgesteuerte Läufe', () => {
    it('stopWhen: genau 3 Durchgänge, nicht abgebrochen', async () => {
      const { args } = await setup({ trials: undefined });
      const handle = await startTrainingSession(args);
      let calls = 0;
      const res = await handle.run(args.deps, { stopWhen: () => calls++ >= 3 });
      expect(res.records).toHaveLength(3);
      expect(res.aborted).toBe(false);
    });

    it('activeMs wächst im Lauf und zählt nur Läufe, nicht die Zeit dazwischen', async () => {
      let offsetMs = 0;
      const base = Date.UTC(2026, 9, 11, 10, 0, 0);
      const { args } = await setup({
        now: () => new Date(base + offsetMs),
        onTrial: () => {
          offsetMs += 4000;
        },
        trials: undefined,
      });
      const handle = await startTrainingSession(args);
      expect(handle.activeMs()).toBe(0);
      const seen: number[] = [];
      let calls = 0;
      await handle.run(args.deps, {
        stopWhen: () => {
          seen.push(handle.activeMs());
          return calls++ >= 3;
        },
      });
      // Vor jedem Durchgang gemessen: 0, 4 s, 8 s, 12 s, 12 s (Vergleich bei Abbruchprüfung).
      expect(seen[0]).toBe(0);
      expect(seen[1]!).toBeGreaterThan(seen[0]!);
      expect(seen[2]!).toBeGreaterThan(seen[1]!);
      expect(handle.activeMs()).toBe(12_000);
      offsetMs += 10 * 60_000; // Pause zwischen den Läufen zählt nicht
      expect(handle.activeMs()).toBe(12_000);
      let calls2 = 0;
      await handle.run(autoDeps(null), { stopWhen: () => calls2++ >= 2 });
      expect(handle.activeMs()).toBe(20_000);
    });

    it('ohne trials und mit stopWhen false endet der Lauf bei MAX_TRIALS_PER_SESSION', async () => {
      limits.max = 5;
      try {
        const { db, args } = await setup({ trials: undefined });
        const handle = await startTrainingSession(args);
        const res = await handle.run(args.deps, { stopWhen: () => false });
        expect(res.records.filter((r) => r.outcome !== 'aborted')).toHaveLength(5);
        // Ein weiterer Lauf spielt nichts mehr ab.
        const again = await handle.run(autoDeps(null), { stopWhen: () => false });
        expect(again.records).toHaveLength(0);
        expect((await db.listTrials('sess-1')).length).toBe(5);
      } finally {
        limits.max = 800;
      }
    });

    it('offene Sitzung wird beim Start geschlossen: Ende = Beginn ihres letzten Durchgangs, summary null', async () => {
      const { db, args } = await setup({ trials: 1 });
      await db.addSession({
        id: 'old',
        startedAtIso: '2026-10-11T09:00:00.000Z',
        endedAtIso: null,
        dayKey: '2026-10-11',
        kind: 'training',
        trialCount: 2,
      });
      await db.addTrial(sampleRecord({ id: 'old-0', sessionId: 'old', startedAtIso: '2026-10-11T09:05:00.000Z' }));
      await db.addTrial(sampleRecord({ id: 'old-1', sessionId: 'old', startedAtIso: '2026-10-11T09:10:00.000Z' }));
      // Offene Sitzung ohne Durchgang: Ende = eigener Beginn. Referenzsitzungen bleiben unberührt.
      await db.addSession({ id: 'empty', startedAtIso: '2026-10-10T08:00:00.000Z', endedAtIso: null, dayKey: '2026-10-10', kind: 'training', trialCount: 0 });
      await db.addSession({ id: 'ref', startedAtIso: '2026-10-10T07:00:00.000Z', endedAtIso: null, dayKey: '2026-10-10', kind: 'reference', trialCount: 0 });

      await startTrainingSession(args);

      const byId = new Map((await db.listSessions()).map((s) => [s.id, s]));
      expect(byId.get('old')!.endedAtIso).toBe('2026-10-11T09:10:00.000Z');
      expect(byId.get('old')!.summary ?? null).toBeNull();
      expect(byId.get('empty')!.endedAtIso).toBe('2026-10-10T08:00:00.000Z');
      expect(byId.get('ref')!.endedAtIso).toBeNull();
      // Die neue Sitzung bleibt offen.
      expect(byId.get('sess-1')!.endedAtIso).toBeNull();
    });

    it('trialCount steht schon nach dem ersten gespeicherten Durchgang in der DB (Lauf noch nicht beendet)', async () => {
      const { db, args } = await setup({ trials: 3 });
      const seen: number[] = [];
      let finished = false;
      const handle = await startTrainingSession({
        ...args,
        onTrial: async () => {
          expect(finished).toBe(false);
          seen.push((await db.listSessions())[0]!.trialCount);
        },
      });
      await handle.run(args.deps);
      finished = true;
      expect(seen).toEqual([1, 2, 3]);
    });

    it('geschlossene offene Sitzung übernimmt trialCount aus den gespeicherten Durchgängen', async () => {
      const { db, args } = await setup({ trials: 1 });
      await db.addSession({ id: 'old', startedAtIso: '2026-10-11T09:00:00.000Z', endedAtIso: null, dayKey: '2026-10-11', kind: 'training', trialCount: 0 });
      await db.addTrial(sampleRecord({ id: 'old-0', sessionId: 'old', startedAtIso: '2026-10-11T09:05:00.000Z' }));
      await db.addTrial(sampleRecord({ id: 'old-1', sessionId: 'old', startedAtIso: '2026-10-11T09:10:00.000Z' }));
      await startTrainingSession(args);
      const old = (await db.listSessions()).find((s) => s.id === 'old')!;
      expect(old.trialCount).toBe(2);
      expect(old.endedAtIso).toBe('2026-10-11T09:10:00.000Z');
    });

    it('Abbruch, dann neue Sitzung: die gespeicherte Karte wird nicht noch einmal vergessen', async () => {
      const { db, args } = await setup({ deps: autoDeps(10), trials: 30 });
      const first = await runTrainingSession(args);
      expect(first.aborted).toBe(true);
      const saved = (await db.getController())!;
      expect(saved.openSession).toBe(true);
      expect(saved.map.logLik.some((row) => row.some((v) => v !== 0))).toBe(true);

      const next = await startTrainingSession({ ...args, sessionId: 'sess-2', rng: createRng(9) });
      expect(next.planner.state().map.logLik).toEqual(saved.map.logLik);
      // Die abgebrochene Sitzung wurde dabei geschlossen.
      const old = (await db.listSessions()).find((s) => s.id === 'sess-1')!;
      expect(old.endedAtIso).not.toBeNull();
      expect(old.summary ?? null).toBeNull();
    });

    it('finish speichert den Snapshot mit guess', async () => {
      const { db, args } = await setup({ trials: 5 });
      await runTrainingSession(args);
      const snap = (await db.listMapSnapshots()).find((s) => s.reason === 'sessionEnd')!;
      expect(snap.guess).toEqual((await db.getController())!.guess);
      expect(snap.guess).toBeDefined();
    });

    it('anderes Raster: gespeicherter Controller hat andere gridSignature', async () => {
      const a = await setup({ trials: 3 });
      await runTrainingSession(a.args);
      const b = await setup({ trials: 3, grid: { ...DEFAULT_GRID, angleStepDeg: 30 } });
      await runTrainingSession(b.args);
      expect((await b.db.getController())!.gridSignature).not.toBe((await a.db.getController())!.gridSignature);
    });
  });
});
