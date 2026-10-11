import { describe, expect, it } from 'vitest';
import { gridPoints } from '../../src/core/blocks';
import { makeGeometry } from '../../src/core/geometry';
import { createMap, summarizePoint, THETA_GRID, type MapState } from '../../src/core/map';
import { createRng } from '../../src/core/rng';
import { createStairs, regionOf } from '../../src/core/staircase';
import { choosePoint, selectionScores } from '../../src/core/selector';

const geometry = makeGeometry(
  { screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 },
  1200,
  800,
);
const points = gridPoints(geometry, 'L');
const GAMMA = 0.05;
const stairs = createStairs();
const LEVEL = 6;

/** Zeile mit der gesamten Masse bei einem θ-Wert (sicherer Posterior). */
function sharpRow(theta: number): number[] {
  return THETA_GRID.map((t) => (t === theta ? 0 : -1000));
}

/** Breiter Posterior um θ₀ (hohe Unsicherheit). */
function broadRow(center: number, spread: number): number[] {
  return THETA_GRID.map((t) => -((t - center) ** 2) / (2 * spread * spread));
}

function mapWith(target: number): MapState {
  const m = createMap(points);
  for (let i = 0; i < points.length; i++) {
    // alle anderen: sicher weit unter der Stufe (p ≈ 1) oder weit darüber (p ≈ γ)
    m.logLik[i] = i === target ? broadRow(5, 2.5) : sharpRow(i % 2 === 0 ? -1 : 14);
  }
  return m;
}

function draw(m: MapState, n: number, seed: number, last: number | null = null): number[] {
  const rng = createRng(seed);
  const counts = new Array<number>(m.points.length).fill(0);
  for (let k = 0; k < n; k++) counts[choosePoint(m, stairs, GAMMA, rng, last)]!++;
  return counts;
}

describe('selectionScores', () => {
  it('liefert je Punkt einen endlichen Score >= 0 bei der Stufe der Region', () => {
    const m = createMap(points);
    const scores = selectionScores(m, stairs, GAMMA);
    expect(scores).toHaveLength(points.length);
    for (const s of scores) {
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('nutzt die Stufe der Region des Punkts, begrenzt auf round(θ̂) ± 1', () => {
    const st = createStairs();
    // leere Karte: θ̂ = 6,5 → Band 6..8; Stufe 7 liegt im Band, Stufe 2 würde auf 6 angehoben
    st.upper = { ...st.upper, level: 7 };
    const m = createMap(points);
    const scores = selectionScores(m, st, GAMMA);
    const iUpper = points.findIndex((p) => regionOf(p.pos.angleDeg) === 'upper');
    const iMiddle = points.findIndex((p) => regionOf(p.pos.angleDeg) === 'middle');
    const expected = (i: number, level: number): number => {
      const s = summarizePoint(m, i, level, GAMMA);
      return s.pSd * Math.exp(-(((s.p - 0.625) / 0.15) ** 2));
    };
    expect(scores[iUpper]).toBeCloseTo(expected(iUpper, 7), 12);
    st.upper = { ...st.upper, level: 2 };
    expect(selectionScores(m, st, GAMMA)[iUpper]).toBeCloseTo(expected(iUpper, 6), 12);
    expect(scores[iMiddle]).toBeCloseTo(expected(iMiddle, 6), 12);
  });
});

describe('choosePoint', () => {
  it('bevorzugt den unsicheren Grenzpunkt (p ≈ 0,6)', () => {
    const target = points.findIndex((p) => p.pos.angleDeg === 0 && p.pos.eccDeg === 13);
    expect(target).toBeGreaterThanOrEqual(0);
    const m = mapWith(target);
    const s = summarizePoint(m, target, LEVEL, GAMMA);
    expect(s.p).toBeGreaterThan(0.5);
    expect(s.p).toBeLessThan(0.7);
    expect(s.pSd).toBeGreaterThan(0.15);
    const counts = draw(m, 2000, 3);
    expect(counts[target]! / 2000).toBeGreaterThanOrEqual(0.6);
  });

  it('wählt auf einer leeren Karte jeden Punkt mindestens einmal', () => {
    const counts = draw(createMap(points), 2000, 5);
    expect(counts.every((c) => c >= 1)).toBe(true);
  });

  it('liefert nie lastIndex, auch wenn er der beste Punkt ist', () => {
    const target = points.findIndex((p) => p.pos.angleDeg === 0 && p.pos.eccDeg === 13);
    const m = mapWith(target);
    const counts = draw(m, 500, 7, target);
    expect(counts[target]).toBe(0);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(500);
  });

  it('verteilt gleichmäßig, wenn alle Scores 0 sind', () => {
    const m = createMap(points);
    for (let i = 0; i < points.length; i++) m.logLik[i] = sharpRow(14);
    expect(selectionScores(m, stairs, GAMMA).every((s) => s === 0)).toBe(true);
    const counts = draw(m, 5000, 11);
    for (const c of counts) expect(c / 5000).toBeGreaterThanOrEqual(0.01);
  });

  it('liefert bei nur einem Punkt diesen Punkt', () => {
    const m = createMap(points.slice(0, 1));
    expect(choosePoint(m, stairs, GAMMA, createRng(1), 0)).toBe(0);
  });
});
