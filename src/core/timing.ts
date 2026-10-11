/**
 * Einstellbares Tempo: wie lange das Licht sichtbar ist, wie lang die Pause zwischen den Lichtern dauert
 * und wie viel Zeit zum Tippen mindestens bleibt. Die Grenzen halten die Sicherheitsregeln ein
 * (Pause nie unter 1 s, Rampen unverändert).
 */

export interface TimingSettings {
  /** Dauer des vollen Lichts zwischen den beiden Rampen (ms). Sichtbar insgesamt: Plateau + 2 · Rampe. */
  plateauMs: number;
  /** Pause vor dem ersten Reiz eines Durchgangs: untere und obere Grenze (ms). */
  waitMinMs: number;
  waitMaxMs: number;
  /** Untergrenze der Zeit zum Tippen (ms). */
  responseWindowMinMs: number;
}

export const DEFAULT_TIMING: TimingSettings = { plateauMs: 700, waitMinMs: 1500, waitMaxMs: 3500, responseWindowMinMs: 2000 };

export const TIMING_LIMITS = {
  plateauMs: [300, 1500],
  waitMinMs: [1000, 5000],
  waitMaxMs: [1000, 6000],
  responseWindowMinMs: [1500, 4000],
} as const;

function limit(v: number | undefined, [lo, hi]: readonly [number, number], fallback: number): number {
  const x = v === undefined || !Number.isFinite(v) ? fallback : v;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}

/** Fehlende Felder aus dem Standard, jedes Feld in seine Grenzen, obere Pause nie unter der unteren. */
export function clampTiming(t: Partial<TimingSettings>): TimingSettings {
  const waitMinMs = limit(t.waitMinMs, TIMING_LIMITS.waitMinMs, DEFAULT_TIMING.waitMinMs);
  const waitMaxMs = Math.max(waitMinMs, limit(t.waitMaxMs, TIMING_LIMITS.waitMaxMs, DEFAULT_TIMING.waitMaxMs));
  return {
    plateauMs: limit(t.plateauMs, TIMING_LIMITS.plateauMs, DEFAULT_TIMING.plateauMs),
    waitMinMs,
    waitMaxMs,
    responseWindowMinMs: limit(t.responseWindowMinMs, TIMING_LIMITS.responseWindowMinMs, DEFAULT_TIMING.responseWindowMinMs),
  };
}
