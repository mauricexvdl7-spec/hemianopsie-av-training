import { LEVEL_COUNT, REFERENCE_LEVEL } from './stimulus';

/** Region des Gesichtsfelds (nach Höhenwinkel), je Region eine eigene Treppe. */
export type Region = 'upper' | 'middle' | 'lower';
export const REGIONS: readonly Region[] = ['upper', 'middle', 'lower'];

/** Region zum Höhenwinkel φ: > 30° oben, < −30° unten, sonst Mitte. */
export function regionOf(angleDeg: number): Region {
  if (angleDeg > 30) return 'upper';
  if (angleDeg < -30) return 'lower';
  return 'middle';
}

/** Band um die Kartenschwelle: die dargebotene Stufe liegt in round(θ̂) ± POINT_LEVEL_BAND. */
export const POINT_LEVEL_BAND = 1;

/** Dargebotene Stufe an einem Punkt: Regionsstufe, begrenzt auf round(θ̂) ± 1 und auf 0..11. */
export function pointLevel(regionLevel: number, thetaHat: number): number {
  const c = Math.round(thetaHat);
  const banded = Math.min(c + POINT_LEVEL_BAND, Math.max(c - POINT_LEVEL_BAND, regionLevel));
  return Math.min(LEVEL_COUNT - 1, Math.max(0, banded));
}

export interface StairState {
  level: number;
  hitStreak: number;
  reversals: number;
  lastDirection: -1 | 0 | 1;
}
export type StairSet = Record<Region, StairState>;

/** Eine Treppe je Region, alle auf derselben Startstufe. */
export function createStairs(startLevel: number = REFERENCE_LEVEL): StairSet {
  const make = (): StairState => ({ level: startLevel, hitStreak: 0, reversals: 0, lastDirection: 0 });
  return { upper: make(), middle: make(), lower: make() };
}

/**
 * 2-down-1-up: zwei Treffer in Folge senken die Stufe (schwächerer Reiz),
 * ein Fehlversuch hebt sie. Schritt 2 bis zur ersten Umkehr, danach 1.
 * Klemmen an 0/11 ist keine Bewegung und keine Umkehr. Rein, neues Objekt.
 */
export function updateStair(s: StairState, hit: boolean): StairState {
  const hitStreak = hit ? s.hitStreak + 1 : 0;
  if (hit && hitStreak < 2) return { ...s, hitStreak };
  const direction: -1 | 1 = hit ? -1 : 1;
  const step = s.reversals === 0 ? 2 : 1;
  const level = Math.min(LEVEL_COUNT - 1, Math.max(0, s.level + direction * step));
  if (level === s.level) return { ...s, hitStreak: 0 };
  const reversed = s.lastDirection !== 0 && s.lastDirection !== direction;
  return {
    level,
    hitStreak: 0,
    reversals: s.reversals + (reversed ? 1 : 0),
    lastDirection: direction,
  };
}
