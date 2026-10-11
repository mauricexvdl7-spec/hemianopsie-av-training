/** Abnahme (Spec 16): Lernen bei fester Phase 1 über Sitzung 5 bis 40 und Sicherheit aller Pläne dieser 40 Sitzungen. */
import { describe, it, expect, beforeAll } from 'vitest';
import type { TrialPlan } from '../../src/core/types';
import { LEARN_SEEDS, LEARN_TO, TRIALS, borderDrop, checkSafety, off, on, runSessions } from '../helpers/acceptance';

const learnResults: Array<{ withLearning: { drop: number; points: number }; without: { drop: number; points: number } }> = [];
let safetyPlans: TrialPlan[] = [];

beforeAll(() => {
  // Phase fest auf 1 (konstanter Tonanteil), 40 Sitzungen (die Lernkurve endet bei 30, das Vergessen holt bis 40 auf).
  LEARN_SEEDS.forEach((seed, k) => {
    const withRun = runSessions(LEARN_TO, seed, on, '1');
    const withoutRun = runSessions(LEARN_TO, seed, off, '1');
    learnResults.push({ withLearning: borderDrop(withRun), without: borderDrop(withoutRun) });
    if (k === 0) safetyPlans = withRun.records.flat();
  });
}, 120_000);

describe('Abnahme Lernen', () => {
  it('Phase fest auf 1: Mittel von θ̂ über Grenzzonenpunkte sinkt mit Lernen von Sitzung 5 bis 40 um ≥ 0,8 (jeder feste Seed)', () => {
    expect(learnResults).toHaveLength(LEARN_SEEDS.length);
    for (const r of learnResults) {
      expect(r.withLearning.points).toBeGreaterThan(5);
      expect(Number.isFinite(r.withLearning.drop)).toBe(true);
      expect(r.withLearning.drop).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('ohne Lernen ändert sich das Mittel um höchstens 0,5 (jeder feste Seed)', () => {
    expect(learnResults).toHaveLength(LEARN_SEEDS.length);
    for (const r of learnResults) {
      expect(r.without.points).toBeGreaterThan(5);
      expect(Number.isFinite(r.without.drop)).toBe(true);
      expect(Math.abs(r.without.drop)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('Abnahme Sicherheit', () => {
  it('alle Pläne der 40 Sitzungen sind sicher, Abstände ≥ 1000 ms bei schnellster Taktung', () => {
    expect(safetyPlans.length).toBe(LEARN_TO * TRIALS);
    expect(safetyPlans.length).toBeGreaterThanOrEqual(10000);
    expect(checkSafety(safetyPlans)).toEqual([]);
  });
});
