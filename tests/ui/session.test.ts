import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { dayKey, runBlock } from '../../src/ui/session';
import { openDb } from '../../src/store/db';
import type { RunnerDeps } from '../../src/ui/runner';
import type { TrialPlan } from '../../src/core/types';
import { samplePlan } from '../helpers/plans';
import { fakeDeps } from '../helpers/fakeRunner';

let n = 0;

function planner(): { next(): TrialPlan } {
  let i = 0;
  return { next: () => samplePlan({ id: `s-${i}`, index: i++, waitMs: 1000 }) };
}

/** Fake-Umgebung, die jeden Durchgang selbständig abspielt: Antwort 400 ms nach t0, optional Abbruch in Durchgang abortAt. */
function autoDeps(abortAt: number | null) {
  const f = fakeDeps();
  let trial = 0;
  const deps: RunnerDeps = {
    ...f.deps,
    frame: (cb) => {
      f.deps.frame(cb);
      queueMicrotask(() => f.advanceTo(f.now + 5));
    },
    input: {
      arm: (cb) => {
        f.deps.input.arm(cb);
        const t = trial++;
        const t0 = f.now + 1000;
        queueMicrotask(() => {
          if (abortAt === t) {
            f.advanceTo(t0 + 100);
            f.abort('hidden');
          } else {
            f.respondAt(t0 + 400);
          }
        });
      },
      disarm: f.deps.input.disarm,
    },
  };
  return deps;
}

describe('dayKey', () => {
  it('lokales Datum', () => {
    expect(dayKey(new Date(2026, 9, 11, 23, 59))).toBe('2026-10-11');
    expect(dayKey(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });
});

describe('runBlock', () => {
  it('20 Durchgänge, alle gespeichert', async () => {
    const db = await openDb(`session-db-${n++}`);
    const seen: string[] = [];
    const recs = await runBlock({
      db,
      planner: planner(),
      deps: autoDeps(null),
      sessionId: 's',
      trials: 20,
      nowIso: () => '2026-10-11T10:00:00.000Z',
      onTrial: (r) => seen.push(r.id),
    });
    expect(recs).toHaveLength(20);
    expect(recs.every((r) => r.outcome === 'hit')).toBe(true);
    expect(await db.listTrials('s')).toHaveLength(20);
    expect(seen).toHaveLength(20);
  });

  it('shouldStop wird vor jedem Durchgang geprüft', async () => {
    const db = await openDb(`session-db-${n++}`);
    let calls = 0;
    const recs = await runBlock({
      db,
      planner: planner(),
      deps: autoDeps(null),
      sessionId: 's',
      trials: 20,
      nowIso: () => '2026-10-11T10:00:00.000Z',
      shouldStop: () => calls++ >= 4,
    });
    expect(recs).toHaveLength(4);
    expect(await db.listTrials('s')).toHaveLength(4);
  });

  it('Abbruch im 3. Durchgang → 3 Datensätze, letzter abgebrochen', async () => {
    const db = await openDb(`session-db-${n++}`);
    const recs = await runBlock({
      db,
      planner: planner(),
      deps: autoDeps(2),
      sessionId: 's',
      trials: 20,
      nowIso: () => '2026-10-11T10:00:00.000Z',
    });
    expect(recs).toHaveLength(3);
    expect(recs[2]!.outcome).toBe('aborted');
    expect(await db.listTrials('s')).toHaveLength(3);
  });

  it('transform läuft vor dem Speichern: gespeichert wird der umgewandelte Datensatz', async () => {
    const db = await openDb(`session-db-${n++}`);
    const recs = await runBlock({
      db,
      planner: planner(),
      deps: autoDeps(null),
      sessionId: 's',
      trials: 3,
      nowIso: () => '2026-10-11T10:00:00.000Z',
      transform: (r) => ({ ...r, stairBefore: 4, stairAfter: 5 }),
    });
    expect(recs.every((r) => r.stairBefore === 4 && r.stairAfter === 5)).toBe(true);
    const saved = await db.listTrials('s');
    expect(saved).toHaveLength(3);
    expect(saved.every((r) => r.stairBefore === 4 && r.stairAfter === 5)).toBe(true);
  });
});
