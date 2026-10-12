import { describe, it, expect } from 'vitest';
import { dailyFeedback, dayCounts, previousDayKey } from '../../src/ui/patient/dailyFeedback';
import type { TrialRecord } from '../../src/core/types';

describe('previousDayKey', () => {
  it('rechnet den Kalendertag davor', () => {
    expect(previousDayKey('2026-10-11')).toBe('2026-10-10');
    expect(previousDayKey('2027-01-01')).toBe('2026-12-31');
    expect(previousDayKey('2028-03-01')).toBe('2028-02-29');
    expect(previousDayKey('2026-03-30')).toBe('2026-03-29');
  });
});

const trial = (sessionId: string, over: Partial<TrialRecord> = {}): TrialRecord =>
  ({
    id: `${sessionId}-${Math.random()}`,
    sessionId,
    kind: 'left',
    outcome: 'hit',
    ...over,
  }) as unknown as TrialRecord;

const sessions = [
  { id: 'a', dayKey: '2026-10-11', kind: 'training' as const },
  { id: 'b', dayKey: '2026-10-11', kind: 'training' as const },
  { id: 'ref', dayKey: '2026-10-11', kind: 'reference' as const },
  { id: 'old', dayKey: '2026-10-10', kind: 'training' as const },
];

describe('dayCounts', () => {
  it('addiert zwei Trainingssitzungen desselben Tages', () => {
    const trials = [trial('a'), trial('a', { outcome: 'miss' }), trial('b')];
    expect(dayCounts(sessions, trials, '2026-10-11')).toEqual({ found: 2, total: 3 });
  });

  it('zählt rechte Durchgänge, Durchgänge ohne Reiz und Abbrüche nicht', () => {
    const trials = [
      trial('a'),
      trial('a', { kind: 'right' }),
      trial('a', { kind: 'catch' }),
      trial('a', { outcome: 'aborted' }),
    ];
    expect(dayCounts(sessions, trials, '2026-10-11')).toEqual({ found: 1, total: 1 });
  });

  it('zählt Referenzsitzungen nicht', () => {
    expect(dayCounts(sessions, [trial('ref')], '2026-10-11')).toEqual({ found: 0, total: 0 });
  });

  it('zählt Durchgänge eines anderen Tages nicht', () => {
    expect(dayCounts(sessions, [trial('old'), trial('a')], '2026-10-11')).toEqual({ found: 1, total: 1 });
  });
});

describe('dailyFeedback', () => {
  it('nennt gestern, wenn heute mehr gefunden wurde', () => {
    const f = dailyFeedback({ found: 5, total: 8 }, { found: 4, total: 8 });
    expect(f.numbersText).toBe('Heute 5 von 8 gefunden.');
    expect(f.follow).toEqual({ kind: 'yesterday', text: 'Gestern waren es 4.' });
    expect(f.found).toBe(5);
    expect(f.total).toBe(8);
  });

  it('Gleichstand zählt als gestern', () => {
    expect(dailyFeedback({ found: 4, total: 8 }, { found: 4, total: 9 }).follow.kind).toBe('yesterday');
  });

  it('weniger als gestern, ohne Vortag oder Vortag ohne Durchgänge: Ermutigung', () => {
    expect(dailyFeedback({ found: 3, total: 8 }, { found: 4, total: 8 }).follow).toEqual({ kind: 'encouragement' });
    expect(dailyFeedback({ found: 3, total: 8 }, null).follow).toEqual({ kind: 'encouragement' });
    expect(dailyFeedback({ found: 3, total: 8 }, { found: 0, total: 0 }).follow).toEqual({ kind: 'encouragement' });
  });
});
