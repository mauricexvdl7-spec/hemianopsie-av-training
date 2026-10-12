import { PAUSE_MIN_MS } from '../../core/schedule';
import type { DailyFeedback } from './dailyFeedback';

/** Ablauf einer Trainingssitzung aus Sicht des Patienten. */
export type FlowState =
  | { kind: 'checking' }
  | { kind: 'limit' }
  | { kind: 'intro' }
  | { kind: 'running'; run: number; newSegment: boolean }
  | { kind: 'pause'; reason: 'scheduled' | 'interrupted'; sinceMs: number; ready: boolean }
  | { kind: 'ending' }
  | { kind: 'feedback'; feedback: DailyFeedback };

export type FlowEvent =
  | { type: 'checked'; limitReached: boolean }
  | { type: 'introDone' }
  | { type: 'segmentDone'; step: 'pause' | 'end'; nowMs: number }
  | { type: 'interrupted'; nowMs: number }
  | { type: 'tick'; nowMs: number }
  | { type: 'tap'; nowMs: number; windowOk: boolean }
  | { type: 'finishToday' }
  | { type: 'ended'; feedback: DailyFeedback };

export const INITIAL_FLOW: FlowState = { kind: 'checking' };

/** Nicht behandelte Zustand/Ereignis-Kombinationen geben denselben Zustand (`===`) zurück. */
export function flowReducer(s: FlowState, e: FlowEvent): FlowState {
  switch (s.kind) {
    case 'checking':
      if (e.type === 'checked') return e.limitReached ? { kind: 'limit' } : { kind: 'intro' };
      return s;
    case 'intro':
      if (e.type === 'introDone') return { kind: 'running', run: 1, newSegment: true };
      return s;
    case 'running':
      if (e.type === 'segmentDone') {
        return e.step === 'pause'
          ? { kind: 'pause', reason: 'scheduled', sinceMs: e.nowMs, ready: false }
          : { kind: 'ending' };
      }
      if (e.type === 'interrupted') return { kind: 'pause', reason: 'interrupted', sinceMs: e.nowMs, ready: true };
      return s;
    case 'pause':
      if (e.type === 'tick') {
        if (s.ready || e.nowMs - s.sinceMs < PAUSE_MIN_MS) return s;
        return { ...s, ready: true };
      }
      if (e.type === 'tap') {
        if (!e.windowOk || !(s.ready || e.nowMs - s.sinceMs >= PAUSE_MIN_MS)) return s;
        return { kind: 'running', run: e.nowMs, newSegment: s.reason === 'scheduled' };
      }
      if (e.type === 'finishToday') return { kind: 'ending' };
      return s;
    case 'ending':
      if (e.type === 'ended') return { kind: 'feedback', feedback: e.feedback };
      return s;
    default:
      return s;
  }
}
