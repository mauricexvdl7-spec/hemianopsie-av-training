import { describe, it, expect } from 'vitest';
import { createControllerState } from '../../src/core/controller';
import { makeGeometry } from '../../src/core/geometry';
import type { MapSnapshot, SessionRecord } from '../../src/store/db';
import { monthKeyOf, monthLabel, monthReport, shiftMonth } from '../../src/ui/admin/report';
import { sampleRecord } from '../helpers/plans';

const g = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820);
const map = createControllerState(g).map;

function session(id: string, dayKey: string, o: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    startedAtIso: `${dayKey}T10:00:00.000Z`,
    endedAtIso: null,
    dayKey,
    kind: 'training',
    trialCount: 5,
    summary: { stage: '1', durationMin: 20, meanLeftLevel: 6, leftHitRate: 0.5 },
    stage: '1',
    ...o,
  };
}

function snap(sessionId: string, atIso: string, o: Partial<MapSnapshot> = {}): MapSnapshot {
  return { id: `${sessionId}:sessionEnd`, sessionId, atIso, gridSignature: 'x', map, stage: '1', reason: 'sessionEnd', ...o };
}

const trial = (sessionId: string, id: string) => sampleRecord({ id, sessionId, kind: 'left', outcome: 'hit', sound: 'none', rtMs: 400 });

describe('Monatsrechnung', () => {
  it('monthKeyOf schneidet den Tag ab', () => {
    expect(monthKeyOf('2026-10-11')).toBe('2026-10');
  });

  it('shiftMonth über Jahresgrenzen', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
    expect(shiftMonth('2026-03', -14)).toBe('2025-01');
  });

  it('monthLabel auf Deutsch', () => {
    expect(monthLabel('2026-10')).toBe('Oktober 2026');
    expect(monthLabel('2026-03')).toBe('März 2026');
  });
});

describe('monthReport', () => {
  const sessions = [
    session('sep', '2026-09-30'),
    session('a', '2026-10-02', { summary: { stage: '1', durationMin: 20, meanLeftLevel: 6, leftHitRate: 0.5 }, stage: '1' }),
    session('b', '2026-10-15', { summary: { stage: '2', durationMin: 30, meanLeftLevel: 6, leftHitRate: 0.5 }, stage: '2' }),
    session('empty', '2026-10-16', { trialCount: 0, summary: { stage: '3a', durationMin: 5, meanLeftLevel: 6, leftHitRate: 0.5 }, stage: '3a' }),
    session('nov', '2026-11-01'),
  ];
  const trials = [trial('sep', 't0'), trial('a', 't1'), trial('b', 't2'), trial('nov', 't3')];
  const snaps = [
    snap('sep', '2026-09-30T10:30:00'),
    snap('a', '2026-10-02T10:30:00'),
    snap('b', '2026-10-15T10:30:00'),
    snap('b', '2026-10-15T10:31:00', { id: 'b:gridChanged', reason: 'gridChanged' }),
    snap('nov', '2026-11-01T10:30:00'),
  ];

  it('Sitzungen, Minuten und Zeitraum des Monats', () => {
    const r = monthReport('2026-10', sessions, trials, snaps);
    expect(r.month).toBe('2026-10');
    expect(r.sessionCount).toBe(2);
    expect(r.minutes).toBe(50);
    expect(r.fromDay).toBe('2026-10-01');
    expect(r.toDay).toBe('2026-10-31');
    expect(r.points.map((p) => p.sessionId)).toEqual(['a', 'b']);
  });

  it('Anfangs- und Endkarte, Stufe am Monatsende', () => {
    const r = monthReport('2026-10', sessions, trials, snaps);
    expect(r.startSnapshot?.sessionId).toBe('sep');
    expect(r.endSnapshot?.sessionId).toBe('b');
    expect(r.endSnapshot?.reason).toBe('sessionEnd');
    expect(r.stageAtEnd).toBe('2');
  });

  it('ohne Karte vor dem Monat: erste Karte im Monat; Monatsgrenzen 28, 29, 30 Tage', () => {
    const r = monthReport('2026-10', sessions, trials, snaps.slice(1));
    expect(r.startSnapshot?.sessionId).toBe('a');
    expect(monthReport('2026-02', [], [], []).toDay).toBe('2026-02-28');
    expect(monthReport('2028-02', [], [], []).toDay).toBe('2028-02-29');
    expect(monthReport('2026-04', [], [], []).toDay).toBe('2026-04-30');
  });

  it('Karten gehören zum Monat nach dem lokalen Datum von atIso', () => {
    const late = snap('b', new Date(2026, 9, 31, 23, 30).toISOString());
    const r = monthReport('2026-10', sessions, trials, [late]);
    expect(r.endSnapshot?.sessionId).toBe('b');
    const next = snap('nov', new Date(2026, 10, 1, 0, 30).toISOString());
    expect(monthReport('2026-10', sessions, trials, [next]).endSnapshot).toBeNull();
  });

  it('ohne Sitzungen', () => {
    const r = monthReport('2026-10', [], [], []);
    expect(r.sessionCount).toBe(0);
    expect(r.minutes).toBe(0);
    expect(r.startSnapshot).toBeNull();
    expect(r.endSnapshot).toBeNull();
    expect(r.stageAtEnd).toBeNull();
    expect(r.points).toEqual([]);
  });
});
