/**
 * Schwellen-Karte der linken Gesichtsfeldhälfte: pro Rasterpunkt ein Gitter-Posterior über die Schwelle θ.
 * Der Zustand ist reines JSON (Log-Likelihoods), Beobachtungen werden räumlich geglättet.
 */
import { angularDistanceDeg } from './geometry';
import type { GridPoint } from './blocks';
import type { VisualPos } from './types';

/** Schwellengitter θ = −1,0 … 14,0 in Schritten von 0,5 (31 Werte). */
export const THETA_GRID: readonly number[] = Array.from({ length: 31 }, (_, k) => -1 + 0.5 * k);

export const PSY_SLOPE = 1;
export const PSY_LAPSE = 0.04;
/** Glättungsbreite: 1° (Raster 5°); breitere Kerne verwischen die scharfe Hemianopsie-Grenze. */
export const KERNEL_SIGMA_DEG = 1;
export const KERNEL_CUTOFF = 0.05;
export const DEFAULT_HALF_LIFE_SESSIONS = 7;

/** Trefferwahrscheinlichkeit bei Stufe L, Schwelle θ und Rate-Wahrscheinlichkeit γ. */
export function psychometric(level: number, theta: number, gamma: number): number {
  return gamma + (1 - gamma - PSY_LAPSE) / (1 + Math.exp(-(level - theta) / PSY_SLOPE));
}

export interface MapState {
  points: GridPoint[];
  /** [Punkt][θ-Index], gleiche Länge wie THETA_GRID. */
  logLik: number[][];
}

/** Leere Karte (Gleichverteilung). Nur linke Punkte. */
export function createMap(points: GridPoint[]): MapState {
  if (points.some((p) => p.pos.side !== 'L')) throw new Error('Die Schwellen-Karte enthält nur linke Rasterpunkte.');
  return { points: points.map((p) => ({ id: p.id, pos: { ...p.pos } })), logLik: points.map(() => THETA_GRID.map(() => 0)) };
}

/** Verbucht eine linke Beobachtung (Treffer oder Fehlversuch bei Stufe `level`), gewichtet nach Abstand. Rechts: keine Änderung. */
export function updateMap(m: MapState, obs: { pos: VisualPos; level: number; hit: boolean }, gamma: number): void {
  if (obs.pos.side !== 'L') return;
  const ll = THETA_GRID.map((theta) => {
    const p = psychometric(obs.level, theta, gamma);
    return Math.log(obs.hit ? p : 1 - p);
  });
  for (let i = 0; i < m.points.length; i++) {
    const d = angularDistanceDeg(obs.pos, m.points[i]!.pos);
    const w = Math.exp(-(d * d) / (2 * KERNEL_SIGMA_DEG * KERNEL_SIGMA_DEG));
    if (w < KERNEL_CUTOFF) continue;
    const row = m.logLik[i]!;
    for (let t = 0; t < row.length; t++) row[t] = row[t]! + w * ll[t]!;
  }
}

/** Sitzungsbeginn: alte Evidenz verliert an Gewicht (Halbwertszeit in Sitzungen). */
export function forgetMap(m: MapState, halfLifeSessions: number): void {
  const f = 0.5 ** (1 / halfLifeSessions);
  for (const row of m.logLik) for (let t = 0; t < row.length; t++) row[t] = row[t]! * f;
}

/** Normierter Posterior über THETA_GRID für Punkt i (numerisch stabil). */
export function posterior(m: MapState, i: number): number[] {
  const row = m.logLik[i]!;
  const max = Math.max(...row);
  const w = row.map((v) => Math.exp(v - max));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
}

export interface PointSummary {
  thetaMean: number;
  thetaSd: number;
  /** Erwartete Trefferwahrscheinlichkeit bei `level`. */
  p: number;
  pSd: number;
}

/** Posterior-Zusammenfassung eines Punktes: Schwelle und Trefferwahrscheinlichkeit bei `level`. */
export function summarizePoint(m: MapState, i: number, level: number, gamma: number): PointSummary {
  const post = posterior(m, i);
  let tMean = 0;
  let pMean = 0;
  for (let t = 0; t < post.length; t++) {
    tMean += post[t]! * THETA_GRID[t]!;
    pMean += post[t]! * psychometric(level, THETA_GRID[t]!, gamma);
  }
  let tVar = 0;
  let pVar = 0;
  for (let t = 0; t < post.length; t++) {
    tVar += post[t]! * (THETA_GRID[t]! - tMean) ** 2;
    pVar += post[t]! * (psychometric(level, THETA_GRID[t]!, gamma) - pMean) ** 2;
  }
  return { thetaMean: tMean, thetaSd: Math.sqrt(tVar), p: pMean, pSd: Math.sqrt(pVar) };
}
