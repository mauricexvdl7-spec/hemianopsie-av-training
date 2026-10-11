/** Gemeinsame Messhilfen der Abnahmetests (Spec 16). */
import { createRng } from '../../src/core/rng';
import { makeGeometry } from '../../src/core/geometry';
import { createControllerState, type ControllerState } from '../../src/core/controller';
import { guessRate } from '../../src/core/guessRate';
import { summarizePoint } from '../../src/core/map';
import type { Stage } from '../../src/core/phases';
import { checkGap, checkTrialPlan, stimulusInterval } from '../../src/core/safety';
import { REFERENCE_LEVEL } from '../../src/core/stimulus';
import type { TrialPlan, TrialRecord } from '../../src/core/types';
import { isBorderZone, runSimulatedSession, subjectHitProbability, trueThreshold, type SimOptions } from '../../src/core/sim';

export const g = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820);
export const TRIALS = 250;
export const LEARN_FROM = 5;
export const LEARN_TO = 40;
export const on: SimOptions = { learning: true };
export const off: SimOptions = { learning: false };
/** Feste Seeds (vorab gewählt, nicht nach Ergebnis): Karte und Ortswahl teilen die 5-Sitzungen-Läufe, Lernen läuft über 40 Sitzungen. */
export const MAP_SEEDS = [101, 102, 103, 104, 105] as const;
export const LEARN_SEEDS = [202, 203, 204] as const;

export interface Run {
  records: TrialRecord[][];
  states: ControllerState[];
}

/** Sitzungen 1..n nacheinander (Sitzungsindex 1-basiert); `fixedStage` hält die Phase (und damit den Tonanteil) fest. */
export function runSessions(n: number, seed: number, opts: SimOptions, fixedStage?: Stage): Run {
  const rng = createRng(seed);
  let state = createControllerState(g);
  const run: Run = { records: [], states: [] };
  for (let i = 1; i <= n; i++) {
    if (fixedStage) state = { ...state, phase: { ...state.phase, stage: fixedStage } };
    const res = runSimulatedSession(state, g, i, TRIALS, rng, opts);
    state = res.state;
    run.records.push(res.records);
    run.states.push(state);
  }
  return run;
}

/** Anteil der linken Durchgänge der Sitzungen 3..5, deren wahres p (Probanden-Formel, ohne Ton) bei der gezogenen Stufe in [0,3; 0,9] liegt. */
export function selectionShare(run: Run): { share: number; trials: number } {
  const state = run.states[4]!;
  const pos = new Map(state.map.points.map((p) => [p.id, p.pos]));
  let inside = 0;
  let trials = 0;
  for (let s = 3; s <= 5; s++) {
    for (const r of run.records[s - 1]!) {
      if (r.kind !== 'left' || r.level === null) continue;
      const at = pos.get(r.gridPointId!)!;
      const p = subjectHitProbability(r.level, trueThreshold(at, s, on), on);
      trials++;
      if (p >= 0.3 && p <= 0.9) inside++;
    }
  }
  return { share: trials > 0 ? inside / trials : NaN, trials };
}

/** Mittel von θ̂ über die Grenzzonenpunkte nach Sitzung `session`. */
export function borderMean(run: Run, session: number): { mean: number; points: number } {
  const state = run.states[session - 1]!;
  const gamma = guessRate(state.guess);
  const idx = state.map.points.map((p, i) => (isBorderZone(p.pos) ? i : -1)).filter((i) => i >= 0);
  const sum = idx.reduce((a, i) => a + summarizePoint(state.map, i, REFERENCE_LEVEL, gamma).thetaMean, 0);
  return { mean: idx.length > 0 ? sum / idx.length : NaN, points: idx.length };
}

/** Abnahme der Lernkurve: Rückgang des Grenzzonen-Mittels von Sitzung 5 bis 40 (positiv = sinkt). */
export function borderDrop(run: Run): { drop: number; points: number } {
  const a = borderMean(run, LEARN_FROM);
  const b = borderMean(run, LEARN_TO);
  return { drop: a.mean - b.mean, points: Math.min(a.points, b.points) };
}

/** Prüft Sicherheitsregeln und den Mindestabstand bei schnellster Taktung über eine Planfolge. */
export function checkSafety(plans: readonly TrialPlan[]): string[] {
  const errors: string[] = [];
  let end: number | null = null;
  let t = 0;
  for (const p of plans) {
    errors.push(...checkTrialPlan(p));
    const iv = stimulusInterval(p);
    const t0 = t + p.waitMs;
    if (iv) {
      errors.push(...checkGap(end, t0 + iv.startMs));
      end = t0 + iv.endMs;
    }
    t = t0 + 2 * p.rampMs + p.plateauMs; // schnellste Taktung: der nächste Durchgang beginnt, sobald der Reiz endet
  }
  return errors;
}
