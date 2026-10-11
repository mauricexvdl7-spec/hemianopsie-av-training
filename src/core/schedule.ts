/**
 * Sitzungstakt und Tageslimit: wann eine Pause fällig ist, wann die Sitzung endet und wie viele
 * Sitzungen pro Kalendertag erlaubt sind. Gezählt wird nur aktive Zeit (Durchgänge laufen),
 * Pausen und Ansagen zählen nicht.
 */

/** Pause nach jeweils so viel aktiver Zeit (ms). */
export const PAUSE_EVERY_MS = 300_000;
/** Mindestdauer einer geplanten Pause (ms). */
export const PAUSE_MIN_MS = 30_000;
/** Höchstens so viele begonnene Trainingssitzungen je Kalendertag. */
export const MAX_SESSIONS_PER_DAY = 2;
/** Schutzgrenze: Durchgänge je Sitzung. */
export const MAX_TRIALS_PER_SESSION = 800;
export const SESSION_MINUTES_DEFAULT = 30;
export const SESSION_MINUTES_LIMITS = { min: 10, max: 30, step: 5 } as const;

/** Auf 5er-Schritte runden, auf 10..30 begrenzen; NaN/undefiniert → 30. */
export function clampSessionMinutes(m: number | undefined): number {
  if (m === undefined || !Number.isFinite(m)) return SESSION_MINUTES_DEFAULT;
  const { min, max, step } = SESSION_MINUTES_LIMITS;
  return Math.min(max, Math.max(min, Math.round(m / step) * step));
}

export type ScheduleStep = 'trial' | 'pause' | 'end';

/** Vor jedem Durchgang: 'end' wenn activeMs ≥ Sitzungsdauer, sonst 'pause' wenn segmentActiveMs ≥ PAUSE_EVERY_MS, sonst 'trial'. */
export function nextStep(a: { activeMs: number; segmentActiveMs: number; sessionMinutes: number }): ScheduleStep {
  if (a.activeMs >= a.sessionMinutes * 60_000) return 'end';
  if (a.segmentActiveMs >= PAUSE_EVERY_MS) return 'pause';
  return 'trial';
}

export interface DaySessionLike {
  dayKey: string;
  kind: string;
  trialCount: number;
}

/** Begonnene Trainingssitzungen (trialCount ≥ 1) mit diesem dayKey. Maßgeblich ist der Starttag der Sitzung. */
export function sessionsStartedOn(sessions: readonly DaySessionLike[], day: string): number {
  return sessions.filter((s) => s.dayKey === day && s.kind === 'training' && s.trialCount >= 1).length;
}

export function dailyLimitReached(sessions: readonly DaySessionLike[], day: string): boolean {
  return sessionsStartedOn(sessions, day) >= MAX_SESSIONS_PER_DAY;
}
