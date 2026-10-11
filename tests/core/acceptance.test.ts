/** Abnahme (Spec 16): Karte, Ortswahl und Sicherheit je Phasenstufe. Lernen und Sicherheit über 40 Sitzungen: acceptance-learning.test.ts. */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRng } from '../../src/core/rng';
import { createControllerState, createSessionPlanner } from '../../src/core/controller';
import { STAGES, setStageManually } from '../../src/core/phases';
import { DEFAULT_WINDOW_MS } from '../../src/core/trial';
import { thresholdRmse } from '../../src/core/sim';
import { MAP_SEEDS, checkSafety, g, on, runSessions, selectionShare } from '../helpers/acceptance';

const mapResults: Array<{ rmse: number | null; points: number; share: number; trials: number }> = [];

beforeAll(() => {
  for (const seed of MAP_SEEDS) {
    const run = runSessions(5, seed, on);
    mapResults.push({ ...thresholdRmse(run.states[4]!, 5, on), ...selectionShare(run) });
  }
}, 60_000);

describe('Abnahme Karte', () => {
  it('nach 5 Sitzungen à 250: RMSE der Schwelle über Punkte mit θ_wahr ≤ 11 höchstens 1,5 (jeder feste Seed)', () => {
    expect(mapResults).toHaveLength(MAP_SEEDS.length);
    for (const r of mapResults) {
      expect(r.points).toBeGreaterThan(10);
      expect(Number.isFinite(r.rmse)).toBe(true);
      expect(r.rmse!).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('Abnahme Ortswahl', () => {
  it('ab Sitzung 3: mindestens 50 % der linken Durchgänge liegen bei wahrem p in [0,3; 0,9] (jeder feste Seed)', () => {
    expect(mapResults).toHaveLength(MAP_SEEDS.length);
    for (const r of mapResults) {
      expect(r.trials).toBeGreaterThan(300); // 3 Sitzungen × etwa 175 linke Durchgänge
      expect(Number.isFinite(r.share)).toBe(true);
      expect(r.share).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('Abnahme Sicherheit je Phasenstufe', () => {
  it.each(STAGES.map((s) => [s]))('1000 Pläne in Phasenstufe %s sind sicher', (stage) => {
    const state = createControllerState(g);
    state.phase = setStageManually(state.phase, stage, '2026-01-01T00:00:00.000Z');
    const planner = createSessionPlanner(state, {
      rng: createRng(300 + STAGES.indexOf(stage)),
      geometry: g,
      sessionId: `stage-${stage}`,
      responseWindowMs: DEFAULT_WINDOW_MS,
    });
    const plans = Array.from({ length: 1000 }, () => planner.next());
    expect(plans).toHaveLength(1000);
    expect(plans.every((p) => p.phase === stage)).toBe(true);
    expect(checkSafety(plans)).toEqual([]);
  });
});
