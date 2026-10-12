import { describe, it, expect } from 'vitest';
import type { Stage } from '../../src/core/phases';
import type { TrialRecord } from '../../src/core/types';
import type { SessionRecord } from '../../src/store/db';
import { gridAngleFromId, median, phaseLines, sessionPoints, type SessionPoint } from '../../src/ui/admin/analysis';
import { sampleRecord } from '../helpers/plans';

let k = 0;
function trial(sessionId: string, o: Partial<TrialRecord>): TrialRecord {
  return sampleRecord({ id: `t-${k++}`, sessionId, stairBefore: null, ...o });
}
const left = (sessionId: string, outcome: TrialRecord['outcome'], sound: TrialRecord['sound'], rtMs: number | null = 450) =>
  trial(sessionId, { kind: 'left', outcome, sound, rtMs });
const right = (sessionId: string, rtMs: number) =>
  trial(sessionId, { kind: 'right', outcome: 'hit', sound: 'none', rtMs, pos: { side: 'R', eccDeg: 8, angleDeg: 0 }, gridPointId: null });
const catchTrial = (sessionId: string, outcome: TrialRecord['outcome']) =>
  trial(sessionId, { kind: 'catch', outcome, sound: 'none', rtMs: null, pos: null, gridPointId: null, level: null });

function session(id: string, startedAtIso: string, o: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    startedAtIso,
    endedAtIso: null,
    dayKey: startedAtIso.slice(0, 10),
    kind: 'training',
    trialCount: 1,
    summary: { stage: '1', durationMin: 25, meanLeftLevel: 6, leftHitRate: 0.5 },
    stage: '1',
    ...o,
  };
}

describe('median', () => {
  it('ungerade, gerade und leer', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('gridAngleFromId', () => {
  it('liest den Winkel aus der Rasterpunkt-ID', () => {
    expect(gridAngleFromId('L-e8-a-30')).toBe(-30);
    expect(gridAngleFromId('L-e13-a90')).toBe(90);
    expect(gridAngleFromId('x')).toBeNull();
    expect(gridAngleFromId(null)).toBeNull();
  });
});

describe('sessionPoints', () => {
  const trials = [
    left('a', 'hit', 'none'),
    left('a', 'hit', 'none'),
    left('a', 'hit', 'none'),
    left('a', 'miss', 'none', null),
    left('a', 'hit', 'sync'),
    left('a', 'hit', 'sync'),
    left('a', 'miss', 'wrongSide', null),
    left('a', 'anticipation', 'none', 80),
    right('a', 400),
    right('a', 600),
    catchTrial('a', 'falseAlarm'),
    catchTrial('a', 'correctRejection'),
    catchTrial('a', 'correctRejection'),
    catchTrial('a', 'correctRejection'),
    trial('b', { outcome: 'aborted', rtMs: null }),
    left('ref', 'hit', 'none'),
  ];
  const sessions = [
    session('a', '2026-10-02T09:00:00.000Z'),
    session('b', '2026-10-01T09:00:00.000Z'),
    session('ref', '2026-09-30T09:00:00.000Z', { kind: 'reference' }),
  ];

  it('Kennzahlen einer Sitzung', () => {
    const pts = sessionPoints(sessions, trials);
    expect(pts).toHaveLength(1);
    const p = pts[0]!;
    expect(p.sessionId).toBe('a');
    expect(p.minutes).toBe(25);
    expect(p.stage).toBe('1');
    expect(p.lightOnlyHitRate).toBe(0.75);
    expect(p.leftHitRate).toBeCloseTo(5 / 7, 12);
    expect(p.wrongSideHitRate).toBe(0);
    expect(p.falseAlarmRate).toBe(0.25);
    expect(p.rtRightMedianMs).toBe(500);
    expect(p.rtLeftMedianMs).toBe(450);
  });

  it('nur abgebrochene Durchgänge oder Referenzsitzung: nicht in der Liste; sortiert nach Beginn', () => {
    const more = [...trials, left('c', 'hit', 'none')];
    const pts = sessionPoints([...sessions, session('c', '2026-10-01T12:00:00.000Z', { summary: null, stage: null })], more);
    expect(pts.map((p) => p.sessionId)).toEqual(['c', 'a']);
    expect(pts[0]!.minutes).toBeNull();
    expect(pts[0]!.stage).toBeNull();
    expect(pts[0]!.falseAlarmRate).toBeNull();
    expect(pts[0]!.rtRightMedianMs).toBeNull();
  });

  it('stairMean je Region über die Rasterpunkt-ID', () => {
    const t = [
      trial('s', { kind: 'left', gridPointId: 'L-e8-a30', pos: { side: 'L', eccDeg: 8, angleDeg: 30.8 }, stairBefore: 4 }),
      trial('s', { kind: 'left', gridPointId: 'L-e8-a30', pos: { side: 'L', eccDeg: 8, angleDeg: 30.8 }, stairBefore: 6 }),
    ];
    const [p] = sessionPoints([session('s', '2026-10-03T09:00:00.000Z')], t);
    expect(p!.stairMean).toEqual({ upper: null, middle: 5, lower: null });
  });
});

describe('phaseLines', () => {
  it('Linie bei jedem Wechsel gegenüber der letzten bekannten Stufe', () => {
    const stages: Array<Stage | null> = ['1', '1', null, '2', '2', '3a'];
    const pts = stages.map((stage, i) => ({ sessionId: `s${i}`, stage }) as SessionPoint);
    expect(phaseLines(pts)).toEqual([
      { index: 3, stage: '2' },
      { index: 5, stage: '3a' },
    ]);
  });
});
