/**
 * Ortswahl für den nächsten linken Reiz: bevorzugt die Grenzzone, in der die Karte
 * eine Trefferwahrscheinlichkeit um 0,625 vorhersagt und noch unsicher ist.
 */
import { summarizePoint, type MapState } from './map';
import type { Rng } from './rng';
import { pointLevel, regionOf, type StairSet } from './staircase';

export const SELECT_TARGET_P = 0.625;
export const SELECT_WIDTH = 0.15;
export const SELECT_EPSILON = 0.15;

/** Stufe, die an Punkt i dargeboten wird: Stufe seiner Region, begrenzt auf die Kartenschwelle ± 1. */
export function presentedLevel(m: MapState, stairs: StairSet, i: number, gamma: number): number {
  const regionLevel = stairs[regionOf(m.points[i]!.pos.angleDeg)].level;
  return pointLevel(regionLevel, summarizePoint(m, i, regionLevel, gamma).thetaMean);
}

/** Score je Punkt: u · exp(−((p − 0,625)/0,15)²), p und u (Unsicherheit) bei der dargebotenen Stufe des Punkts. */
export function selectionScores(m: MapState, stairs: StairSet, gamma: number): number[] {
  return m.points.map((_, i) => {
    const s = summarizePoint(m, i, presentedLevel(m, stairs, i, gamma), gamma);
    return s.pSd * Math.exp(-(((s.p - SELECT_TARGET_P) / SELECT_WIDTH) ** 2));
  });
}

/**
 * Index des nächsten Punkts: 85 % proportional zum Score, 15 % gleichverteilt;
 * `lastIndex` wird nie direkt wiederholt (außer bei nur einem Punkt). Alle Scores 0 → gleichverteilt.
 */
export function choosePoint(m: MapState, stairs: StairSet, gamma: number, rng: Rng, lastIndex: number | null): number {
  const n = m.points.length;
  if (n === 0) throw new Error('Die Karte enthält keine Punkte.');
  if (n === 1) return 0;
  const scores = selectionScores(m, stairs, gamma);
  if (lastIndex !== null && lastIndex >= 0 && lastIndex < n) scores[lastIndex] = 0;
  const total = scores.reduce((a, b) => a + b, 0);
  const uniform = rng.next() < SELECT_EPSILON || !Number.isFinite(total) || total <= 0;
  if (!uniform) {
    let r = rng.next() * total;
    let last = -1;
    for (let i = 0; i < n; i++) {
      if (scores[i]! <= 0) continue;
      last = i;
      r -= scores[i]!;
      if (r < 0) return i;
    }
    if (last >= 0) return last;
  }
  // gleichverteilt über alle Punkte außer lastIndex
  const skip = lastIndex !== null && lastIndex >= 0 && lastIndex < n ? lastIndex : -1;
  const k = rng.int(skip >= 0 ? n - 1 : n);
  return skip >= 0 && k >= skip ? k + 1 : k;
}
