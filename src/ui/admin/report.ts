/** Rechnung für den Monatsbericht. Rein rechnend: kein Speicher, kein DOM. */
import type { Stage } from '../../core/phases';
import type { TrialRecord } from '../../core/types';
import type { MapSnapshot, SessionRecord } from '../../store/db';
import { dayKey } from '../session';
import { sessionPoints, type SessionPoint } from './analysis';

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const pad = (n: number) => String(n).padStart(2, '0');

/** '2026-10-11' → '2026-10'. */
export function monthKeyOf(day: string): string {
  return day.slice(0, 7);
}

function parseMonth(month: string): { year: number; index: number } {
  return { year: Number(month.slice(0, 4)), index: Number(month.slice(5, 7)) - 1 };
}

/** '2026-01', −1 → '2025-12'. */
export function shiftMonth(month: string, delta: number): string {
  const { year, index } = parseMonth(month);
  const total = year * 12 + index + delta;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** '2026-10' → 'Oktober 2026'. */
export function monthLabel(month: string): string {
  const { year, index } = parseMonth(month);
  return `${MONTH_NAMES[index] ?? month} ${year}`;
}

/** Erster und letzter Kalendertag des Monats (YYYY-MM-DD); Schaltjahre und Monatslängen berücksichtigt. */
export function monthBounds(month: string): { fromDay: string; toDay: string } {
  const { year, index } = parseMonth(month);
  return { fromDay: `${month}-01`, toDay: `${month}-${pad(new Date(year, index + 1, 0).getDate())}` };
}

export interface MonthReport {
  month: string;
  /** Erster und letzter Kalendertag des Monats (YYYY-MM-DD). */
  fromDay: string;
  toDay: string;
  /** Trainingssitzungen mit trialCount ≥ 1 im Monat. */
  sessionCount: number;
  /** Summe der Sitzungsdauern (summary.durationMin), gerundet. */
  minutes: number;
  /** Letzte Sitzungsende-Karte vor Monatsbeginn, sonst die erste im Monat. */
  startSnapshot: MapSnapshot | null;
  /** Letzte Sitzungsende-Karte im Monat. */
  endSnapshot: MapSnapshot | null;
  points: SessionPoint[];
  /** Stufe der letzten Sitzung des Monats. */
  stageAtEnd: Stage | null;
}

const byStart = (a: SessionRecord, b: SessionRecord) => (a.startedAtIso < b.startedAtIso ? -1 : a.startedAtIso > b.startedAtIso ? 1 : 0);

export function monthReport(
  month: string,
  sessions: readonly SessionRecord[],
  trials: readonly TrialRecord[],
  snapshots: readonly MapSnapshot[],
): MonthReport {
  const { fromDay, toDay } = monthBounds(month);
  const inMonth = sessions.filter((s) => s.kind === 'training' && s.trialCount >= 1 && monthKeyOf(s.dayKey) === month).sort(byStart);
  const ids = new Set(inMonth.map((s) => s.id));
  const minutes = Math.round(inMonth.reduce((sum, s) => sum + (s.summary?.durationMin ?? 0), 0));

  // Lokales Datum der Karte (nicht UTC), nach Zeit sortiert
  const ends = snapshots
    .filter((s) => s.reason === 'sessionEnd')
    .map((s) => ({ snap: s, day: dayKey(new Date(s.atIso)) }))
    .sort((a, b) => (a.snap.atIso < b.snap.atIso ? -1 : a.snap.atIso > b.snap.atIso ? 1 : 0));
  const before = ends.filter((e) => e.day < fromDay);
  const within = ends.filter((e) => e.day >= fromDay && e.day <= toDay);

  return {
    month,
    fromDay,
    toDay,
    sessionCount: inMonth.length,
    minutes,
    startSnapshot: (before[before.length - 1] ?? within[0])?.snap ?? null,
    endSnapshot: within[within.length - 1]?.snap ?? null,
    points: sessionPoints(inMonth, trials.filter((t) => ids.has(t.sessionId))),
    stageAtEnd: inMonth[inMonth.length - 1]?.stage ?? null,
  };
}
