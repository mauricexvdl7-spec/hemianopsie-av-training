import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng';
import {
  assignSound,
  createPhaseState,
  evaluatePhase,
  setStageManually,
  STAGES,
  type PhaseState,
  type SessionSummary,
  type Stage,
} from '../../src/core/phases';

const N = 10000;

function draw(stage: Stage, kind: 'left' | 'right' | 'catch' = 'left') {
  const rng = createRng(12345);
  return Array.from({ length: N }, () => assignSound(stage, kind, rng));
}
const pct = (xs: unknown[], pred: (x: never) => boolean) =>
  (xs.filter((x) => pred(x as never)).length / xs.length) * 100;

describe('STAGES', () => {
  it('hat die Reihenfolge 1..5', () => {
    expect(STAGES).toEqual(['1', '2', '3a', '3b', '3c', '4a', '4b', '4c', '5']);
  });
});

describe('assignSound links', () => {
  it('Stufe 1: 10 % none, Rest sync mit SOA 0', () => {
    const xs = draw('1');
    expect(Math.abs(pct(xs, (x: { sound: string }) => x.sound === 'none') - 10)).toBeLessThanOrEqual(1.5);
    const rest = xs.filter((x) => x.sound !== 'none');
    expect(rest.every((x) => x.sound === 'sync' && x.soaMs === 0 && x.soundGainDb === 0)).toBe(true);
  });

  it('Stufe 2: 10 % none, 10 % wrongSide, SOA in [-300,-100], Pegel 0', () => {
    const xs = draw('2');
    expect(Math.abs(pct(xs, (x: { sound: string }) => x.sound === 'none') - 10)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(pct(xs, (x: { sound: string }) => x.sound === 'wrongSide') - 10)).toBeLessThanOrEqual(1.5);
    const tone = xs.filter((x) => x.sound === 'lead' || x.sound === 'wrongSide');
    expect(tone.every((x) => x.soaMs >= -300 && x.soaMs <= -100 && x.soundGainDb === 0)).toBe(true);
    expect(xs.filter((x) => x.sound === 'none').every((x) => x.soaMs === 0)).toBe(true);
  });

  it('Pegel der Stufen 3a/3b/3c/4x', () => {
    const levels: Array<[Stage, number]> = [['3a', -6], ['3b', -12], ['3c', -18], ['4a', -18], ['4c', -18]];
    for (const [stage, db] of levels) {
      const tone = draw(stage).filter((x) => x.sound !== 'none');
      expect(tone.length).toBeGreaterThan(0);
      expect(tone.every((x) => x.soundGainDb === db)).toBe(true);
    }
  });

  it('Stufe 3b: Pegel -12 für alle Tondurchgänge', () => {
    const tone = draw('3b').filter((x) => x.sound !== 'none');
    expect(tone.every((x) => x.soundGainDb === -12)).toBe(true);
  });

  it('Stufe 4b: Ton 50 %, wrongSide 5 %, Pegel -18', () => {
    const xs = draw('4b');
    expect(Math.abs(pct(xs, (x: { sound: string }) => x.sound !== 'none') - 50)).toBeLessThanOrEqual(2);
    expect(Math.abs(pct(xs, (x: { sound: string }) => x.sound === 'wrongSide') - 5)).toBeLessThanOrEqual(1);
    const tone = xs.filter((x) => x.sound !== 'none');
    expect(tone.every((x) => x.soundGainDb === -18 && x.soaMs >= -300 && x.soaMs <= -100)).toBe(true);
  });

  it('Tonanteile 4a 75 %, 4c 25 %', () => {
    expect(Math.abs(pct(draw('4a'), (x: { sound: string }) => x.sound !== 'none') - 75)).toBeLessThanOrEqual(2);
    expect(Math.abs(pct(draw('4c'), (x: { sound: string }) => x.sound !== 'none') - 25)).toBeLessThanOrEqual(2);
  });

  it('Stufe 5: nur none', () => {
    expect(draw('5').every((x) => x.sound === 'none' && x.soaMs === 0 && x.soundGainDb === 0)).toBe(true);
  });
});

describe('assignSound rechts und catch', () => {
  it('rechts Stufe 2: nie wrongSide, nie none', () => {
    const xs = draw('2', 'right');
    expect(xs.every((x) => x.sound === 'lead')).toBe(true);
  });

  it('rechts Stufe 1: sync; Stufe 5: none', () => {
    expect(draw('1', 'right').every((x) => x.sound === 'sync' && x.soaMs === 0)).toBe(true);
    expect(draw('5', 'right').every((x) => x.sound === 'none')).toBe(true);
  });

  it('rechts Stufe 4b: Tonanteil 50 %, nie wrongSide', () => {
    const xs = draw('4b', 'right');
    expect(Math.abs(pct(xs, (x: { sound: string }) => x.sound === 'lead') - 50)).toBeLessThanOrEqual(2);
    expect(xs.some((x) => x.sound === 'wrongSide')).toBe(false);
  });

  it('catch ist immer none, SOA 0, 0 dB', () => {
    for (const stage of STAGES) {
      expect(draw(stage, 'catch').every((x) => x.sound === 'none' && x.soaMs === 0 && x.soundGainDb === 0)).toBe(true);
    }
  });
});

const s = (level: number, rate = 0.7, min = 30, stage: Stage = '1'): SessionSummary => ({
  stage,
  durationMin: min,
  meanLeftLevel: level,
  leftHitRate: rate,
});

function run(state: PhaseState, sessions: SessionSummary[]): PhaseState {
  return sessions.reduce((st, x, i) => evaluatePhase(st, x, `2026-01-0${i + 1}T10:00:00Z`), state);
}

function atStage(stage: Stage, extra: Partial<PhaseState> = {}): PhaseState {
  return { ...createPhaseState(), stage, ...extra };
}

describe('evaluatePhase Wechsel', () => {
  it('startet in Stufe 1', () => {
    const st = createPhaseState();
    expect(st.stage).toBe('1');
    expect(st.levelBeforeChange).toBeNull();
    expect(st.lockSessions).toBe(0);
  });

  it('Stufe 1: nach der 5. stabilen Sitzung Stufe 2', () => {
    const levels = [6, 6.5, 6, 6, 6];
    const after4 = run(createPhaseState(), levels.slice(0, 4).map((l) => s(l)));
    expect(after4.stage).toBe('1');
    const after5 = run(after4, [s(6)]);
    expect(after5.stage).toBe('2');
    expect(after5.levelBeforeChange).toBeCloseTo(6, 10);
    expect(after5.history).toEqual([]);
    expect(after5.sessionsInStage).toBe(0);
    expect(after5.sessionsSinceChange).toBe(0);
    expect(after5.log).toEqual([{ atIso: '2026-01-01T10:00:00Z', from: '1', to: '2', reason: 'advance' }]);
  });

  it('Stufe 2: drei stabile Sitzungen -> 3a', () => {
    const st = run(atStage('2'), [s(6), s(6), s(6)]);
    expect(st.stage).toBe('3a');
  });

  it('Schwankung 6, 7.5, 6 -> kein Wechsel', () => {
    expect(run(atStage('2'), [s(6), s(7.5), s(6)]).stage).toBe('2');
  });

  it('steigend 5.5, 6, 6.4 -> kein Wechsel', () => {
    expect(run(atStage('2'), [s(5.5), s(6), s(6.4)]).stage).toBe('2');
  });

  it('Trefferquote 0.55 in einer Sitzung -> kein Wechsel', () => {
    expect(run(atStage('2'), [s(6), s(6, 0.55), s(6)]).stage).toBe('2');
  });

  it('Sitzung mit 8 Minuten zählt nicht', () => {
    const st = atStage('2');
    const out = evaluatePhase(st, s(6, 0.7, 8), '2026-01-01T10:00:00Z');
    expect(out).toEqual(st);
    expect(run(atStage('2'), [s(6), s(6), s(6, 0.7, 8)]).stage).toBe('2');
  });

  it('kein Wechsel über Stufe 5 hinaus', () => {
    const st = run(atStage('5'), [s(6), s(6), s(6), s(6)]);
    expect(st.stage).toBe('5');
  });
});

describe('evaluatePhase Rückschritt', () => {
  it('3a mit levelBeforeChange 6: 8.5, 8.6, 9 -> Stufe 2, Sperre 3; danach 7,7,7 -> 3a erst nach der 3.', () => {
    let st = atStage('3a', { levelBeforeChange: 6 });
    st = run(st, [s(8.5), s(8.6), s(9)]);
    expect(st.stage).toBe('2');
    expect(st.lockSessions).toBe(3);
    expect(st.levelBeforeChange).toBeNull();
    expect(st.history).toEqual([]);
    expect(st.sessionsInStage).toBe(0);
    expect(st.log[st.log.length - 1]).toMatchObject({ from: '3a', to: '2', reason: 'regress' });

    st = evaluatePhase(st, s(7), '2026-02-01T10:00:00Z');
    expect(st.stage).toBe('2');
    st = evaluatePhase(st, s(7), '2026-02-02T10:00:00Z');
    expect(st.stage).toBe('2');
    st = evaluatePhase(st, s(7), '2026-02-03T10:00:00Z');
    expect(st.stage).toBe('3a');
    expect(st.lockSessions).toBe(0);
  });

  it('kein Rückschritt in Stufe 1', () => {
    const st = run(atStage('1', { levelBeforeChange: 6 }), [s(9), s(9.5), s(10)]);
    expect(st.stage).toBe('1');
  });

  it('kein Rückschritt ohne levelBeforeChange', () => {
    const st = run(atStage('3a'), [s(9), s(10), s(11)]);
    expect(st.stage).not.toBe('2');
  });
});

describe('setStageManually', () => {
  it('setzt Stufe, Zähler 0 und Log manual', () => {
    const base = run(atStage('2', { levelBeforeChange: 5, lockSessions: 2 }), [s(6)]);
    const st = setStageManually(base, '4a', '2026-03-01T09:00:00Z');
    expect(st.stage).toBe('4a');
    expect(st.history).toEqual([]);
    expect(st.sessionsInStage).toBe(0);
    expect(st.levelBeforeChange).toBeNull();
    expect(st.lockSessions).toBe(0);
    expect(st.log[st.log.length - 1]).toEqual({ atIso: '2026-03-01T09:00:00Z', from: '2', to: '4a', reason: 'manual' });
  });

  it('setzt auch sessionsSinceChange auf 0', () => {
    const base = { ...run(atStage('2', { levelBeforeChange: 5 }), [s(6)]), sessionsSinceChange: 4 };
    expect(base.sessionsSinceChange).toBe(4);
    expect(setStageManually(base, '3a', '2026-03-01T09:00:00Z').sessionsSinceChange).toBe(0);
  });
});
