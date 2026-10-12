import { describe, it, expect } from 'vitest';
import { INITIAL_FLOW, flowReducer, type FlowState } from '../../src/ui/patient/flow';
import { PAUSE_MIN_MS } from '../../src/core/schedule';
import type { DailyFeedback } from '../../src/ui/patient/dailyFeedback';

const fb: DailyFeedback = {
  found: 1,
  total: 2,
  numbersText: 'Heute 1 von 2 gefunden.',
  follow: { kind: 'encouragement' },
};
const scheduled = (ready = false): FlowState => ({ kind: 'pause', reason: 'scheduled', sinceMs: 1000, ready });
const interrupted: FlowState = { kind: 'pause', reason: 'interrupted', sinceMs: 1000, ready: true };

describe('flowReducer', () => {
  it('startet in checking', () => {
    expect(INITIAL_FLOW).toEqual({ kind: 'checking' });
  });

  it('checking -> limit oder intro', () => {
    expect(flowReducer(INITIAL_FLOW, { type: 'checked', limitReached: true })).toEqual({ kind: 'limit' });
    expect(flowReducer(INITIAL_FLOW, { type: 'checked', limitReached: false })).toEqual({ kind: 'intro' });
  });

  it('intro -> running (Lauf 1, neues Segment)', () => {
    expect(flowReducer({ kind: 'intro' }, { type: 'introDone' })).toEqual({ kind: 'running', run: 1, newSegment: true });
  });

  it('running -> geplante Pause, Ende, Unterbrechung', () => {
    const r: FlowState = { kind: 'running', run: 1, newSegment: true };
    expect(flowReducer(r, { type: 'segmentDone', step: 'pause', nowMs: 5000 })).toEqual({
      kind: 'pause',
      reason: 'scheduled',
      sinceMs: 5000,
      ready: false,
    });
    expect(flowReducer(r, { type: 'segmentDone', step: 'end', nowMs: 5000 })).toEqual({ kind: 'ending' });
    expect(flowReducer(r, { type: 'interrupted', nowMs: 7000 })).toEqual({
      kind: 'pause',
      reason: 'interrupted',
      sinceMs: 7000,
      ready: true,
    });
  });

  it('tick setzt ready erst ab PAUSE_MIN_MS und erzeugt nur dann ein neues Objekt', () => {
    const s = scheduled();
    expect(flowReducer(s, { type: 'tick', nowMs: 1000 + PAUSE_MIN_MS - 1 })).toBe(s);
    const t = flowReducer(s, { type: 'tick', nowMs: 1000 + PAUSE_MIN_MS });
    expect(t).toEqual({ kind: 'pause', reason: 'scheduled', sinceMs: 1000, ready: true });
    expect(t).not.toBe(s);
    const ready = scheduled(true);
    expect(flowReducer(ready, { type: 'tick', nowMs: 1000 + PAUSE_MIN_MS + 5000 })).toBe(ready);
  });

  it('tap in geplanter Pause wirkt erst nach 30 s', () => {
    const s = scheduled();
    expect(flowReducer(s, { type: 'tap', nowMs: 1000 + PAUSE_MIN_MS - 1, windowOk: true })).toBe(s);
    expect(flowReducer(s, { type: 'tap', nowMs: 1000 + PAUSE_MIN_MS, windowOk: true })).toEqual({
      kind: 'running',
      run: 1000 + PAUSE_MIN_MS,
      newSegment: true,
    });
  });

  it('tap mit ready wirkt auch ohne Zeitprüfung', () => {
    expect(flowReducer(scheduled(true), { type: 'tap', nowMs: 1001, windowOk: true })).toEqual({
      kind: 'running',
      run: 1001,
      newSegment: true,
    });
  });

  it('tap mit windowOk false bleibt wirkungslos', () => {
    const s = scheduled();
    expect(flowReducer(s, { type: 'tap', nowMs: 1000 + 60_000, windowOk: false })).toBe(s);
    expect(flowReducer(interrupted, { type: 'tap', nowMs: 2000, windowOk: false })).toBe(interrupted);
  });

  it('unterbrochene Pause: tap sofort, kein neues Segment', () => {
    expect(flowReducer(interrupted, { type: 'tap', nowMs: 1001, windowOk: true })).toEqual({
      kind: 'running',
      run: 1001,
      newSegment: false,
    });
  });

  it('pause -> ending bei finishToday', () => {
    expect(flowReducer(scheduled(), { type: 'finishToday' })).toEqual({ kind: 'ending' });
    expect(flowReducer(interrupted, { type: 'finishToday' })).toEqual({ kind: 'ending' });
  });

  it('ending -> feedback', () => {
    expect(flowReducer({ kind: 'ending' }, { type: 'ended', feedback: fb })).toEqual({ kind: 'feedback', feedback: fb });
  });

  it('tap in intro, ending, feedback liefert denselben Zustand', () => {
    const states: FlowState[] = [{ kind: 'intro' }, { kind: 'ending' }, { kind: 'feedback', feedback: fb }];
    for (const s of states) expect(flowReducer(s, { type: 'tap', nowMs: 99_999, windowOk: true })).toBe(s);
  });

  it('nicht behandelte Kombinationen liefern denselben Zustand', () => {
    const states: FlowState[] = [
      { kind: 'checking' },
      { kind: 'limit' },
      { kind: 'intro' },
      { kind: 'running', run: 1, newSegment: true },
      scheduled(),
      { kind: 'ending' },
      { kind: 'feedback', feedback: fb },
    ];
    for (const s of states.filter((x) => x.kind !== 'pause')) {
      expect(flowReducer(s, { type: 'finishToday' })).toBe(s);
    }
    const checking = states[0]!;
    expect(flowReducer(checking, { type: 'introDone' })).toBe(checking);
    expect(flowReducer(states[1]!, { type: 'checked', limitReached: false })).toBe(states[1]);
    expect(flowReducer(states[2]!, { type: 'segmentDone', step: 'end', nowMs: 1 })).toBe(states[2]);
    expect(flowReducer(states[3]!, { type: 'tick', nowMs: 1 })).toBe(states[3]);
    expect(flowReducer(states[3]!, { type: 'tap', nowMs: 1, windowOk: true })).toBe(states[3]);
    expect(flowReducer(states[4]!, { type: 'interrupted', nowMs: 1 })).toBe(states[4]);
    expect(flowReducer(states[5]!, { type: 'interrupted', nowMs: 1 })).toBe(states[5]);
    expect(flowReducer(states[6]!, { type: 'ended', feedback: fb })).toBe(states[6]);
  });
});
