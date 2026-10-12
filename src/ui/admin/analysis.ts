/**
 * Kennzahlen je Trainingssitzung für die Auswertung und den Monatsbericht.
 * Rein rechnend: kein Speicher, kein DOM.
 */
import type { Stage } from '../../core/phases';
import { REGIONS, regionOf, type Region } from '../../core/staircase';
import type { TrialRecord } from '../../core/types';
import type { SessionRecord } from '../../store/db';

/** Median; null bei leerer Liste. */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Winkel aus der Rasterpunkt-ID `L-e8-a-30` → -30; null bei fremdem Format. */
export function gridAngleFromId(id: string | null): number | null {
  if (id === null) return null;
  const m = /^[LR]-e\d+(?:\.\d+)?-a(-?\d+(?:\.\d+)?)$/.exec(id);
  return m ? Number(m[1]) : null;
}

export interface SessionPoint {
  sessionId: string;
  startedAtIso: string;
  stage: Stage | null;
  minutes: number | null;
  /** Links, Ton 'none': Treffer / (Treffer + Fehlversuche). */
  lightOnlyHitRate: number | null;
  /** Links, alle Tonbedingungen: Treffer / (Treffer + Fehlversuche). */
  leftHitRate: number | null;
  /** Median der Reaktionszeit linker Treffer. */
  rtLeftMedianMs: number | null;
  /** Median der Reaktionszeit rechter Treffer. */
  rtRightMedianMs: number | null;
  /** Mittlere Treppenstufe vor dem Durchgang je Region (Region über die Rasterpunkt-ID). */
  stairMean: Record<Region, number | null>;
  /** Links, Ton 'wrongSide': Treffer / (Treffer + Fehlversuche). */
  wrongSideHitRate: number | null;
  /** Ohne Reiz: Falschalarme / (Falschalarme + korrekte Zurückweisungen). */
  falseAlarmRate: number | null;
}

const ratio = (a: number, b: number): number | null => (a + b === 0 ? null : a / (a + b));

/** Trefferquote: hit / (hit + miss); Vorwegnahmen und Abbrüche zählen nicht. */
function hitRate(trials: readonly TrialRecord[]): number | null {
  return ratio(trials.filter((t) => t.outcome === 'hit').length, trials.filter((t) => t.outcome === 'miss').length);
}

const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

function rtMedian(trials: readonly TrialRecord[]): number | null {
  return median(trials.filter((t) => t.outcome === 'hit' && t.rtMs !== null).map((t) => t.rtMs!));
}

function pointOf(s: SessionRecord, trials: readonly TrialRecord[]): SessionPoint {
  const left = trials.filter((t) => t.kind === 'left');
  const right = trials.filter((t) => t.kind === 'right');
  const catches = trials.filter((t) => t.kind === 'catch');
  const stairs: Record<Region, number[]> = { upper: [], middle: [], lower: [] };
  for (const t of left) {
    const angle = gridAngleFromId(t.gridPointId);
    if (angle !== null && t.stairBefore !== null) stairs[regionOf(angle)].push(t.stairBefore);
  }
  const stairMean = Object.fromEntries(REGIONS.map((r) => [r, mean(stairs[r])])) as Record<Region, number | null>;
  return {
    sessionId: s.id,
    startedAtIso: s.startedAtIso,
    stage: s.stage ?? null,
    minutes: s.summary?.durationMin ?? null,
    lightOnlyHitRate: hitRate(left.filter((t) => t.sound === 'none')),
    leftHitRate: hitRate(left),
    rtLeftMedianMs: rtMedian(left),
    rtRightMedianMs: rtMedian(right),
    stairMean,
    wrongSideHitRate: hitRate(left.filter((t) => t.sound === 'wrongSide')),
    falseAlarmRate: ratio(catches.filter((t) => t.outcome === 'falseAlarm').length, catches.filter((t) => t.outcome === 'correctRejection').length),
  };
}

/** Trainingssitzungen mit ≥ 1 nicht abgebrochenem Durchgang, nach startedAtIso sortiert; minutes = summary.durationMin. */
export function sessionPoints(sessions: readonly SessionRecord[], trials: readonly TrialRecord[]): SessionPoint[] {
  const bySession = new Map<string, TrialRecord[]>();
  for (const t of trials) {
    if (t.outcome === 'aborted') continue;
    const list = bySession.get(t.sessionId);
    if (list) list.push(t);
    else bySession.set(t.sessionId, [t]);
  }
  return sessions
    .filter((s) => s.kind === 'training' && (bySession.get(s.id)?.length ?? 0) > 0)
    .sort((a, b) => (a.startedAtIso < b.startedAtIso ? -1 : a.startedAtIso > b.startedAtIso ? 1 : 0))
    .map((s) => pointOf(s, bySession.get(s.id)!));
}

/** Index jedes Punkts, dessen Stufe sich von der letzten bekannten Stufe davor unterscheidet. */
export function phaseLines(points: readonly SessionPoint[]): Array<{ index: number; stage: Stage }> {
  const lines: Array<{ index: number; stage: Stage }> = [];
  let last: Stage | null = null;
  points.forEach((p, index) => {
    if (p.stage === null) return;
    if (last !== null && p.stage !== last) lines.push({ index, stage: p.stage });
    last = p.stage;
  });
  return lines;
}
