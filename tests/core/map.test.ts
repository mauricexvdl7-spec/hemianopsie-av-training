import { describe, expect, it } from 'vitest';
import { angularDistanceDeg, makeGeometry } from '../../src/core/geometry';
import { gridPoints } from '../../src/core/blocks';
import {
  createMap,
  forgetMap,
  posterior,
  psychometric,
  summarizePoint,
  THETA_GRID,
  updateMap,
  type MapState,
} from '../../src/core/map';
import type { VisualPos } from '../../src/core/types';

const geometry = makeGeometry(
  { screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 },
  1200,
  800,
);
const points = gridPoints(geometry, 'L');

function indexOf(ecc: number, angle: number): number {
  const i = points.findIndex((p) => p.pos.eccDeg === ecc && p.pos.angleDeg === angle);
  if (i < 0) throw new Error(`Rasterpunkt e${ecc} a${angle} fehlt`);
  return i;
}

function posOf(i: number): VisualPos {
  return points[i]!.pos;
}

describe('Schwellen-Karte', () => {
  it('THETA_GRID: 31 Werte von -1 bis 14', () => {
    expect(THETA_GRID).toHaveLength(31);
    expect(THETA_GRID[0]).toBe(-1);
    expect(THETA_GRID[1]).toBe(-0.5);
    expect(THETA_GRID[30]).toBe(14);
  });

  it('psychometric: bei L = θ genau γ + (1-γ-λ)/2; sehr hohe L → 1-λ; sehr niedrige → γ', () => {
    expect(psychometric(6, 6, 0.05)).toBeCloseTo(0.05 + 0.91 / 2);
    expect(psychometric(30, 0, 0.05)).toBeCloseTo(0.96, 3);
    expect(psychometric(-30, 0, 0.05)).toBeCloseTo(0.05, 3);
  });

  it('leere Karte: Posterior gleichverteilt, Mittel 6,5', () => {
    const m = createMap(points);
    const post = posterior(m, 0);
    expect(post).toHaveLength(THETA_GRID.length);
    for (const w of post) expect(w).toBeCloseTo(1 / 31);
    expect(summarizePoint(m, 0, 6, 0.05).thetaMean).toBeCloseTo(6.5);
  });

  it('Treffer auf Stufe 4 am Punkt senkt dort das Schwellenmittel; Fehlversuch hebt es', () => {
    const i = indexOf(8, 0);
    const base = summarizePoint(createMap(points), i, 6, 0.05).thetaMean;

    const hit = createMap(points);
    updateMap(hit, { pos: posOf(i), level: 4, hit: true }, 0.05);
    expect(summarizePoint(hit, i, 6, 0.05).thetaMean).toBeLessThan(base);

    const miss = createMap(points);
    updateMap(miss, { pos: posOf(i), level: 4, hit: false }, 0.05);
    expect(summarizePoint(miss, i, 6, 0.05).thetaMean).toBeGreaterThan(base);
  });

  it('Nachbar in 0,8° bekommt schwächere Änderung als der Punkt selbst; Punkte in 5° und 10° unverändert', () => {
    const own = indexOf(3, 0);
    // σ = 1°: der Nachbar auf dem Ring e3 (15° Winkelabstand ≈ 0,78°) zählt mit w ≈ 0,74; der Ring e8 (5°) liegt mit w ≈ 4e-6 unter 0,05.
    const near = indexOf(3, 15);
    const far = indexOf(8, 0);
    const farther = indexOf(13, 0);
    expect(angularDistanceDeg(posOf(own), posOf(near))).toBeCloseTo(0.78, 1);
    expect(angularDistanceDeg(posOf(own), posOf(far))).toBeCloseTo(5, 1);
    expect(angularDistanceDeg(posOf(own), posOf(farther))).toBeGreaterThan(9.9);

    const m = createMap(points);
    const base = summarizePoint(m, own, 6, 0.05).thetaMean;
    updateMap(m, { pos: posOf(own), level: 4, hit: true }, 0.05);
    const dOwn = base - summarizePoint(m, own, 6, 0.05).thetaMean;
    const dNear = base - summarizePoint(m, near, 6, 0.05).thetaMean;
    expect(dOwn).toBeGreaterThan(0);
    expect(dNear).toBeGreaterThan(0);
    expect(dNear).toBeLessThan(dOwn);
    expect(m.logLik[far]!.every((v) => v === 0)).toBe(true);
    expect(m.logLik[farther]!.every((v) => v === 0)).toBe(true);
  });

  it('rechte Beobachtung verändert nichts', () => {
    const m = createMap(points);
    const before = JSON.stringify(m);
    updateMap(m, { pos: { side: 'R', eccDeg: 8, angleDeg: 0 }, level: 4, hit: true }, 0.05);
    expect(JSON.stringify(m)).toBe(before);
  });

  it('createMap wirft bei rechten Punkten', () => {
    const right = gridPoints(geometry, 'R');
    expect(() => createMap(right)).toThrow();
    expect(() => createMap([...points, right[0]!])).toThrow();
  });

  it('pSd sinkt mit Evidenz', () => {
    const i = indexOf(8, 0);
    const m = createMap(points);
    const before = summarizePoint(m, i, 6, 0.05).pSd;
    for (let k = 0; k < 10; k++) {
      updateMap(m, { pos: posOf(i), level: 5, hit: true }, 0.05);
      updateMap(m, { pos: posOf(i), level: 7, hit: false }, 0.05);
    }
    const after = summarizePoint(m, i, 6, 0.05).pSd;
    expect(after).toBeLessThan(before);
  });

  it('Vergessen mit H = 1 halbiert die Log-Likelihoods', () => {
    const i = indexOf(8, 0);
    const m = createMap(points);
    updateMap(m, { pos: posOf(i), level: 4, hit: true }, 0.05);
    const before = m.logLik.map((row) => [...row]);
    forgetMap(m, 1);
    for (let a = 0; a < before.length; a++) {
      for (let t = 0; t < before[a]!.length; t++) {
        expect(m.logLik[a]![t]).toBeCloseTo(before[a]![t]! * 0.5, 12);
      }
    }
  });

  it('100× Vergessen + Updates: alle Werte endlich, Posterior summiert auf 1', () => {
    const i = indexOf(8, 0);
    const m = createMap(points);
    for (let k = 0; k < 100; k++) {
      forgetMap(m, 7);
      for (let r = 0; r < 5; r++) {
        updateMap(m, { pos: posOf(i), level: 0, hit: false }, 0.05);
        updateMap(m, { pos: posOf(i), level: 11, hit: r % 2 === 0 }, 0.05);
      }
    }
    for (const row of m.logLik) for (const v of row) expect(Number.isFinite(v)).toBe(true);
    for (let p = 0; p < m.points.length; p++) {
      const post = posterior(m, p);
      expect(post.every((w) => Number.isFinite(w) && w >= 0)).toBe(true);
      expect(post.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it('MapState übersteht JSON.stringify/parse unverändert', () => {
    const m = createMap(points);
    updateMap(m, { pos: posOf(indexOf(8, 0)), level: 4, hit: true }, 0.05);
    const copy = JSON.parse(JSON.stringify(m)) as MapState;
    expect(copy).toEqual(m);
    expect(posterior(copy, 0)).toEqual(posterior(m, 0));
  });
});
