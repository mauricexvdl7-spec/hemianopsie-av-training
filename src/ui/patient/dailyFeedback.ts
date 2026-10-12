import type { TrialRecord } from '../../core/types';
import type { SessionRecord } from '../../store/db';
import { blockSummary } from '../routing';
import { dayKey } from '../session';

/** Kalendertag davor (lokal). Über Mittag gerechnet, damit die Zeitumstellung nie den Tag verschiebt. */
export function previousDayKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const noon = new Date(y, m - 1, d, 12, 0, 0);
  noon.setDate(noon.getDate() - 1);
  return dayKey(noon);
}

/** Linke Durchgänge mit Reiz aller Trainingssitzungen dieses Tages (ohne Abbrüche). */
export function dayCounts(
  sessions: readonly Pick<SessionRecord, 'id' | 'dayKey' | 'kind'>[],
  trials: readonly TrialRecord[],
  day: string,
): { found: number; total: number } {
  const ids = new Set(sessions.filter((s) => s.kind === 'training' && s.dayKey === day).map((s) => s.id));
  return blockSummary(trials.filter((t) => ids.has(t.sessionId)));
}

export interface DailyFeedback {
  found: number;
  total: number;
  /** „Heute X von Y gefunden.“ */
  numbersText: string;
  /** „Gestern waren es Z.“ oder Ermutigung. */
  follow: { kind: 'yesterday'; text: string } | { kind: 'encouragement' };
}

/** Gestern nur nennen, wenn es Daten gibt und heute mindestens so viel gefunden wurde. */
export function dailyFeedback(
  today: { found: number; total: number },
  yesterday: { found: number; total: number } | null,
): DailyFeedback {
  const numbersText = `Heute ${today.found} von ${today.total} gefunden.`;
  const follow: DailyFeedback['follow'] =
    yesterday !== null && yesterday.total > 0 && today.found >= yesterday.found
      ? { kind: 'yesterday', text: `Gestern waren es ${yesterday.found}.` }
      : { kind: 'encouragement' };
  return { found: today.found, total: today.total, numbersText, follow };
}
