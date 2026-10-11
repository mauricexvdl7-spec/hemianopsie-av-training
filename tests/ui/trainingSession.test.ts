import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { makeGeometry } from '../../src/core/geometry';
import { createRng } from '../../src/core/rng';
import { createControllerState } from '../../src/core/controller';
import { openDb } from '../../src/store/db';
import { SESSION_TRIALS_M2, runTrainingSession, startTrainingSession } from '../../src/ui/session';
import type { RunnerDeps } from '../../src/ui/runner';
import { fakeDeps } from '../helpers/fakeRunner';

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
      trials: SESSION_TRIALS_M2,
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
    expect(res.records).toHaveLength(SESSION_TRIALS_M2);

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
    expect(second.records).toHaveLength(SESSION_TRIALS_M2 - 4);
    await handle.finish();

    const all = await db.listTrials('sess-1');
    expect(all.filter((r) => r.outcome !== 'aborted')).toHaveLength(SESSION_TRIALS_M2);
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
});
