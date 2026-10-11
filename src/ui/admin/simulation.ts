/** Simulation für die Testseite: fünf Sitzungen eines simulierten Probanden auf einem frischen, nicht gespeicherten Zustand. */
import { createControllerState } from '../../core/controller';
import type { Geometry } from '../../core/geometry';
import { guessRate } from '../../core/guessRate';
import { summarizePoint } from '../../core/map';
import { createRng } from '../../core/rng';
import { runSimulatedSession, subjectHitProbability, thresholdRmse, trueThreshold, type SimOptions } from '../../core/sim';
import { REFERENCE_LEVEL } from '../../core/stimulus';
import type { MapCell } from './MapView';

export const SIM_SESSIONS = 5;
export const SIM_TRIALS_PER_SESSION = 250;
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
  state.map.points.forEach((pt, i) => {
    const s = summarizePoint(state.map, i, REFERENCE_LEVEL, gamma);
    const theta = trueThreshold(pt.pos, SIM_SESSIONS, SIM_OPTIONS);
    estimate.push({ id: pt.id, pos: pt.pos, p: s.p, theta: s.thetaMean });
    truth.push({ id: pt.id, pos: pt.pos, p: subjectHitProbability(REFERENCE_LEVEL, theta, SIM_OPTIONS), theta });
  });
  const { rmse, points } = thresholdRmse(state, SIM_SESSIONS, SIM_OPTIONS);
  return { seed, estimate, truth, rmse, rmsePoints: points };
}
