/** Auswertung einer Antwort und Länge des Antwortfensters (Spec 6). */
import { DEFAULT_TIMING } from './timing';
import type { Outcome, TrialKind } from './types';

export const MIN_RT_MS = 150;
export const DEFAULT_WINDOW_MS = 2000;
export const WINDOW_MAX_MS = 3000;

/** rtMs relativ zu t0 (Beginn der Lichtrampe), null ohne Antwort. */
export function classifyResponse(kind: TrialKind, rtMs: number | null, windowMs: number): Outcome {
  if (kind === 'catch') {
    return rtMs !== null && rtMs <= windowMs ? 'falseAlarm' : 'correctRejection';
  }
  if (rtMs === null || rtMs > windowMs) return 'miss';
  if (rtMs < MIN_RT_MS) return 'anticipation';
  return 'hit';
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Median + 3·MAD der Referenz-Reaktionszeiten, begrenzt auf minMs bis max(3000, minMs) ms
 * (minMs: einstellbare Untergrenze, Standard 2000 ms); unter 5 Werten max(2000, minMs).
 */
export function responseWindowFromReference(rtsMs: readonly number[], minMs: number = DEFAULT_TIMING.responseWindowMinMs): number {
  if (rtsMs.length < 5) return Math.max(DEFAULT_WINDOW_MS, minMs);
  const med = median(rtsMs);
  const mad = median(rtsMs.map((x) => Math.abs(x - med)));
  return Math.round(Math.min(Math.max(WINDOW_MAX_MS, minMs), Math.max(minMs, med + 3 * mad)));
}
