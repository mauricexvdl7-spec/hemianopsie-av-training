/** Simulation für die Testseite: fünf Sitzungen eines simulierten Probanden auf einem frischen, nicht gespeicherten Zustand. */
import { createControllerState } from '../../core/controller';
import type { Geometry } from '../../core/geometry';
import { guessRate } from '../../core/guessRate';
import { summarizePoint } from '../../core/map';
import { createRng } from '../../core/rng';
import { runSimulatedSession, subjectHitProbability, trueThreshold, type SimOptions } from '../../core/sim';
import { REFERENCE_LEVEL } from '../../core/stimulus';
import type { MapCell } from './MapView';

export const SIM_SESSIONS = 5;
export const SIM_TRIALS_PER_SESSION = 250;
/** Wie in der Abnahme: Der Fehler zählt nur an Orten, die mit irgendeiner Stufe sichtbar sind (wahre Schwelle ≤ 11). */
export const RMSE_MAX_TRUE_THETA = 11;
const SIM_OPTIONS: SimOptions = { learning: true };

export interface SimulationResult {
  /** Startwert des Zufallsgenerators (zum Wiederholen derselben Simulation). */
  seed: number;
  estimate: MapCell[];
  truth: MapCell[];
  /** Quadratisch gemittelter Schwellenfehler in Stufen; null, wenn kein Punkt zählt. */
  rmse: number | null;
  rmsePoints: number;
}

/** Schätzung und wahre Karte nach `SIM_SESSIONS` Sitzungen; schreibt nichts in die Datenbank. */
export function simulateMap(g: Geometry, seed: number): SimulationResult {
  const rng = createRng(seed);
  let state = createControllerState(g);
  for (let i = 1; i <= SIM_SESSIONS; i++) {
    state = runSimulatedSession(state, g, i, SIM_TRIALS_PER_SESSION, rng, SIM_OPTIONS).state;
  }
  const gamma = guessRate(state.guess);
  const estimate: MapCell[] = [];
  const truth: MapCell[] = [];
  let sum = 0;
  let n = 0;
  state.map.points.forEach((pt, i) => {
    const s = summarizePoint(state.map, i, REFERENCE_LEVEL, gamma);
    const theta = trueThreshold(pt.pos, SIM_SESSIONS, SIM_OPTIONS);
    estimate.push({ id: pt.id, pos: pt.pos, p: s.p, theta: s.thetaMean });
    truth.push({ id: pt.id, pos: pt.pos, p: subjectHitProbability(REFERENCE_LEVEL, theta, SIM_OPTIONS), theta });
    if (theta <= RMSE_MAX_TRUE_THETA) {
      sum += (s.thetaMean - theta) ** 2;
      n++;
    }
  });
  return { seed, estimate, truth, rmse: n > 0 ? Math.sqrt(sum / n) : null, rmsePoints: n };
}
