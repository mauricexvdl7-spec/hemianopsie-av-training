import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng';
import { makeGeometry } from '../../src/core/geometry';
import { createControllerState } from '../../src/core/controller';
import { samplePlan } from '../helpers/plans';
import {
  effectiveThreshold,
  isBorderZone,
  runSimulatedSession,
  simulateResponse,
  thresholdRmse,
  trueThreshold,
} from '../../src/core/sim';
import { summarizePoint } from '../../src/core/map';
import { guessRate } from '../../src/core/guessRate';
import type { VisualPos } from '../../src/core/types';

const g = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820);
const L = (eccDeg: number, angleDeg: number): VisualPos => ({ side: 'L', eccDeg, angleDeg });
const R = (eccDeg: number, angleDeg: number): VisualPos => ({ side: 'R', eccDeg, angleDeg });
const off = { learning: false };
const on = { learning: true };

describe('trueThreshold', () => {
  it('rechts horizontal 10° ist sichtbar (θ ≈ 2)', () => {
    expect(trueThreshold(R(10, 0), 0, off)).toBeCloseTo(2, 1);
  });
  it('links horizontal 20° ist blind (θ > 13)', () => {
    expect(trueThreshold(L(20, 0), 0, off)).toBeGreaterThan(13);
  });
  it('links auf der Mittellinie (e = 8, φ = 90) ist sichtbar (θ < 3)', () => {
    expect(trueThreshold(L(8, 90), 0, off)).toBeLessThan(3);
  });
  it('Insel: Mittelpunkt hat θ ≤ 7', () => {
    expect(trueThreshold(L(13, -45), 0, off)).toBeLessThanOrEqual(7);
    expect(trueThreshold(L(13, -45), 0, off)).toBeGreaterThan(4);
  });
  it('schräge Grenze: oben ist die Grenze weiter links als unten', () => {
    expect(trueThreshold(L(4, 40), 0, off)).toBeLessThan(trueThreshold(L(4, -40), 0, off));
  });
  it('Lernen: Grenzpunkt nach 30 Sitzungen 2 Stufen niedriger, halber Weg nach 15', () => {
    const p = L(4, 0);
    const b = trueThreshold(p, 0, on);
    expect(b).toBeGreaterThan(4);
    expect(b).toBeLessThan(12);
    expect(trueThreshold(p, 30, on)).toBeCloseTo(b - 2, 9);
    expect(trueThreshold(p, 15, on)).toBeCloseTo(b - 1, 9);
    expect(trueThreshold(p, 60, on)).toBeCloseTo(b - 2, 9);
    expect(trueThreshold(p, 30, off)).toBeCloseTo(b, 9);
  });
  it('Lernen: blinder und sichtbarer Punkt bleiben unverändert', () => {
    for (const p of [L(20, 0), R(10, 0), L(8, 90)]) {
      expect(trueThreshold(p, 30, on)).toBeCloseTo(trueThreshold(p, 0, on), 9);
    }
  });
});

describe('isBorderZone / Ton', () => {
  it('Grenzzone nur zwischen sichtbar und blind', () => {
    expect(isBorderZone(L(4, 0))).toBe(true);
    expect(isBorderZone(L(20, 0))).toBe(false);
    expect(isBorderZone(R(10, 0))).toBe(false);
    expect(isBorderZone(L(13, -45))).toBe(true);
  });
  it('Ton (sync, lead) senkt die Schwelle nur in der Grenzzone um 1', () => {
    const b = L(4, 0);
    expect(effectiveThreshold(b, 'sync', 0, off)).toBeCloseTo(trueThreshold(b, 0, off) - 1, 9);
    expect(effectiveThreshold(b, 'lead', 0, off)).toBeCloseTo(trueThreshold(b, 0, off) - 1, 9);
    expect(effectiveThreshold(b, 'none', 0, off)).toBeCloseTo(trueThreshold(b, 0, off), 9);
    expect(effectiveThreshold(b, 'wrongSide', 0, off)).toBeCloseTo(trueThreshold(b, 0, off), 9);
    for (const p of [L(20, 0), R(10, 0)]) {
      expect(effectiveThreshold(p, 'sync', 0, off)).toBeCloseTo(trueThreshold(p, 0, off), 9);
    }
  });
});

describe('simulateResponse', () => {
  const hitRate = (pos: VisualPos, level: number, n = 4000, sound: 'none' | 'sync' = 'none') => {
    const rng = createRng(11);
    let h = 0;
    for (let i = 0; i < n; i++) {
      if (simulateResponse(samplePlan({ pos, level, sound }), 0, rng, off).rtMs !== null) h++;
    }
    return h / n;
  };
  it('weit über der Schwelle ≈ 1 − Fehlerrate, weit darunter ≈ γ', () => {
    expect(hitRate(R(10, 0), 11)).toBeGreaterThan(0.94);
    expect(hitRate(R(10, 0), 11)).toBeLessThan(0.995);
    expect(hitRate(L(20, 0), 0)).toBeLessThan(0.09);
  });
  it('Ton erhöht die Trefferrate in der Grenzzone', () => {
    expect(hitRate(L(4, 0), 6, 4000, 'sync')).toBeGreaterThan(hitRate(L(4, 0), 6, 4000, 'none') + 0.1);
  });
  it('Treffer-RT: Median ≈ 450 ms, nie unter 160 ms; ohne Reiz Fehlalarm mit RT 200–1500', () => {
    const rng = createRng(3);
    const rts: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const r = simulateResponse(samplePlan({ pos: R(10, 0), level: 11 }), 0, rng, off).rtMs;
      if (r !== null) rts.push(r);
    }
    rts.sort((a, b) => a - b);
    expect(rts[0]!).toBeGreaterThanOrEqual(160);
    expect(Math.abs(rts[rts.length >> 1]! - 450)).toBeLessThan(15);
    const fa: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const r = simulateResponse(samplePlan({ kind: 'catch', pos: null, level: null, gridPointId: null, sound: 'none' }), 0, rng, off).rtMs;
      if (r !== null) fa.push(r);
    }
    expect(fa.length / 20000).toBeGreaterThan(0.03);
    expect(fa.length / 20000).toBeLessThan(0.05);
    expect(Math.min(...fa)).toBeGreaterThanOrEqual(200);
    expect(Math.max(...fa)).toBeLessThanOrEqual(1500);
  });
});

describe('runSimulatedSession', () => {
  it('liefert vollständige Datensätze und einen fortgeschriebenen Zustand', () => {
    const s0 = createControllerState(g);
    const { state, records } = runSimulatedSession(s0, g, 1, 200, createRng(5), on);
    expect(records).toHaveLength(200);
    expect(state.sessionCount).toBe(1);
    expect(s0.sessionCount).toBe(0);
    expect(state.phase.sessionsInStage).toBe(1);
    for (const r of records) {
      expect(r.startedAtIso).toBe('2026-01-02T00:00:00.000Z');
      expect(r.soundPlayed).toBe(r.sound !== 'none');
      expect(r.fixationOk).toBeNull();
      expect(r.abortReason).toBeNull();
      expect(r.stimulusPx).toBeNull();
      if (r.kind === 'catch') {
        expect(r.contrast).toBeNull();
        expect(r.sigmaDeg).toBeNull();
        expect(['falseAlarm', 'correctRejection']).toContain(r.outcome);
      } else {
        expect(r.contrast).toBeGreaterThan(0);
        expect(r.sigmaDeg).toBeGreaterThan(0);
        expect(['hit', 'miss']).toContain(r.outcome);
      }
    }
    expect(records.some((r) => r.stairBefore !== null && r.stairAfter !== null)).toBe(true);
  });
  it('ist bei gleichem Seed deterministisch', () => {
    const a = runSimulatedSession(createControllerState(g), g, 1, 60, createRng(9), on);
    const b = runSimulatedSession(createControllerState(g), g, 1, 60, createRng(9), on);
    expect(a.records).toEqual(b.records);
    expect(a.state).toEqual(b.state);
  });
});

describe('thresholdRmse', () => {
  it('rechnet über Rasterpunkte mit wahrer Schwelle ≤ 11, gegen die nominale Position und das Lernen der Sitzung', () => {
    const { state } = runSimulatedSession(createControllerState(g), g, 1, 120, createRng(4), on);
    const res = thresholdRmse(state, 7, on);
    let sum = 0;
    let n = 0;
    state.map.points.forEach((pt, i) => {
      const truth = trueThreshold(pt.pos, 7, on);
      if (truth > 11) return;
      sum += (summarizePoint(state.map, i, 6, guessRate(state.guess)).thetaMean - truth) ** 2;
      n++;
    });
    expect(n).toBeGreaterThan(10);
    expect(res.points).toBe(n);
    expect(res.rmse).toBeCloseTo(Math.sqrt(sum / n), 12);
  });
  it('leere Karte: Schätzung 6,5 überall, endlicher Fehler', () => {
    const res = thresholdRmse(createControllerState(g), 0, off);
    expect(res.points).toBeGreaterThan(10);
    expect(Number.isFinite(res.rmse!)).toBe(true);
    expect(res.rmse!).toBeGreaterThan(1);
  });
});
