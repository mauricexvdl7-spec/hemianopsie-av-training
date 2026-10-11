import { describe, it, expect } from 'vitest';
import {
  PAUSE_EVERY_MS,
  PAUSE_MIN_MS,
  MAX_SESSIONS_PER_DAY,
  MAX_TRIALS_PER_SESSION,
  SESSION_MINUTES_DEFAULT,
  SESSION_MINUTES_LIMITS,
  clampSessionMinutes,
  nextStep,
  sessionsStartedOn,
  dailyLimitReached,
} from '../../src/core/schedule';

describe('Konstanten', () => {
  it('haben die festgelegten Werte', () => {
    expect(PAUSE_EVERY_MS).toBe(300_000);
    expect(PAUSE_MIN_MS).toBe(30_000);
    expect(MAX_SESSIONS_PER_DAY).toBe(2);
    expect(MAX_TRIALS_PER_SESSION).toBe(800);
    expect(SESSION_MINUTES_DEFAULT).toBe(30);
    expect(SESSION_MINUTES_LIMITS).toEqual({ min: 10, max: 30, step: 5 });
  });
});

describe('clampSessionMinutes', () => {
  it('rundet auf 5er-Schritte und begrenzt auf 10..30', () => {
    expect(clampSessionMinutes(30)).toBe(30);
    expect(clampSessionMinutes(7)).toBe(10);
    expect(clampSessionMinutes(45)).toBe(30);
    expect(clampSessionMinutes(22)).toBe(20);
    expect(clampSessionMinutes(23)).toBe(25);
  });
  it('NaN und undefiniert → 30', () => {
    expect(clampSessionMinutes(NaN)).toBe(30);
    expect(clampSessionMinutes(undefined)).toBe(30);
  });
});

describe('nextStep', () => {
  const base = { activeMs: 0, segmentActiveMs: 0, sessionMinutes: 30 };
  it('am Anfang und kurz vor 5 Minuten → trial', () => {
    expect(nextStep(base)).toBe('trial');
    expect(nextStep({ ...base, segmentActiveMs: 299_999 })).toBe('trial');
  });
  it('nach 5 Minuten aktiver Zeit im Abschnitt → pause', () => {
    expect(nextStep({ ...base, activeMs: 300_000, segmentActiveMs: 300_000 })).toBe('pause');
  });
  it('Sitzungsdauer erreicht → end, auch wenn eine Pause fällig wäre', () => {
    expect(nextStep({ activeMs: 1_800_000, segmentActiveMs: 300_000, sessionMinutes: 30 })).toBe('end');
    expect(nextStep({ activeMs: 600_000, segmentActiveMs: 0, sessionMinutes: 10 })).toBe('end');
  });
  it('knapp unter der Sitzungsdauer → kein end', () => {
    expect(nextStep({ activeMs: 1_799_999, segmentActiveMs: 0, sessionMinutes: 30 })).toBe('trial');
  });
});

describe('Tageslimit', () => {
  const s = (dayKey: string, kind: string, trialCount: number) => ({ dayKey, kind, trialCount });
  it('sessionsStartedOn zählt nur begonnene Trainingssitzungen dieses Tages', () => {
    expect(sessionsStartedOn([s('2026-10-11', 'training', 1)], '2026-10-11')).toBe(1);
    expect(sessionsStartedOn([s('2026-10-11', 'training', 0)], '2026-10-11')).toBe(0);
    expect(sessionsStartedOn([s('2026-10-11', 'reference', 5)], '2026-10-11')).toBe(0);
    expect(sessionsStartedOn([s('2026-10-10', 'training', 5)], '2026-10-11')).toBe(0);
  });
  it('eine Sitzung, die um 23:55 am 10. begann, zählt für den 10., nicht für den 11.', () => {
    const sessions = [s('2026-10-10', 'training', 12)];
    expect(sessionsStartedOn(sessions, '2026-10-10')).toBe(1);
    expect(sessionsStartedOn(sessions, '2026-10-11')).toBe(0);
  });
  it('dailyLimitReached: bei 1 false, bei 2 true', () => {
    const one = [s('2026-10-11', 'training', 3)];
    expect(dailyLimitReached(one, '2026-10-11')).toBe(false);
    expect(dailyLimitReached([...one, s('2026-10-11', 'training', 1)], '2026-10-11')).toBe(true);
    expect(dailyLimitReached([], '2026-10-11')).toBe(false);
  });
});
