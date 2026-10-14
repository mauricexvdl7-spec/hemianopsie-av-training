import { describe, it, expect } from 'vitest';
import { makeGeometry, fitsOnScreen, maxEccentricityDeg } from '../../src/core/geometry';
import {
  calibrationPoints,
  calibrationFrame,
  calibrationDurationMs,
  toVisualPos,
  CALIB_GLIDE_MS,
  CALIB_HOLD_MS,
  CALIB_SAMPLE_MS,
  CALIB_MARGIN_DEG,
} from '../../src/core/calibration';

// Standardgeometrie: 24 cm breit, 30 cm Abstand, 1180×820, Kreuz bei 2/3, 1/2
const g = makeGeometry(
  { screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 },
  1180,
  820,
);

describe('Konstanten', () => {
  it('Zeiten und Rand', () => {
    expect(CALIB_GLIDE_MS).toBe(1500);
    expect(CALIB_HOLD_MS).toBe(1500);
    expect(CALIB_SAMPLE_MS).toBe(1000);
    expect(CALIB_MARGIN_DEG).toBe(1.5);
  });
});

describe('toVisualPos', () => {
  it('links oben', () => {
    const p = toVisualPos(-3, 4);
    expect(p.side).toBe('L');
    expect(p.eccDeg).toBeCloseTo(5);
    expect(p.angleDeg).toBeCloseTo((Math.atan2(4, 3) * 180) / Math.PI);
  });

  it('rechts unten', () => {
    const p = toVisualPos(3, -3);
    expect(p.side).toBe('R');
    expect(p.eccDeg).toBeCloseTo(Math.hypot(3, 3));
    expect(p.angleDeg).toBeCloseTo(-45);
  });
});

describe('calibrationPoints', () => {
  const pts = calibrationPoints(g);

  it('5 Punkte, center zuerst bei (0, 0), dann die Ecken', () => {
    expect(pts.map((p) => p.id)).toEqual(['center', 'leftUp', 'leftDown', 'rightUp', 'rightDown']);
    expect(pts[0]!.xDeg).toBe(0);
    expect(pts[0]!.yDeg).toBe(0);
  });

  it('Ecken in der richtigen Richtung', () => {
    const byId = Object.fromEntries(pts.map((p) => [p.id, p]));
    expect(byId.leftUp!.xDeg).toBeLessThan(0);
    expect(byId.leftUp!.yDeg).toBeGreaterThan(0);
    expect(byId.leftDown!.xDeg).toBeLessThan(0);
    expect(byId.leftDown!.yDeg).toBeLessThan(0);
    expect(byId.rightUp!.xDeg).toBeGreaterThan(0);
    expect(byId.rightUp!.yDeg).toBeGreaterThan(0);
    expect(byId.rightDown!.xDeg).toBeGreaterThan(0);
    expect(byId.rightDown!.yDeg).toBeLessThan(0);
  });

  it('jede Ecke liegt auf dem Bildschirm und höchstens 1,5° + 0,5° innerhalb der maximalen Ausdehnung', () => {
    for (const p of pts.slice(1)) {
      const v = toVisualPos(p.xDeg, p.yDeg);
      expect(fitsOnScreen(g, v, 1.0)).toBe(true);
      const max = maxEccentricityDeg(g, v.side, v.angleDeg);
      expect(v.eccDeg).toBeGreaterThanOrEqual(max - (CALIB_MARGIN_DEG + 0.5));
    }
  });

  it('Ecken liegen in Richtung der Bildschirmecken (links weiter außen als rechts)', () => {
    const byId = Object.fromEntries(pts.map((p) => [p.id, p]));
    // Kreuz bei 2/3 der Breite: links ist doppelt so viel Platz wie rechts
    expect(Math.abs(byId.leftUp!.xDeg)).toBeGreaterThan(Math.abs(byId.rightUp!.xDeg));
  });
});

describe('calibrationFrame', () => {
  const pts = calibrationPoints(g);

  it('Gesamtdauer 1500 + 4 · 3000', () => {
    expect(calibrationDurationMs(pts)).toBe(13500);
  });

  it('t = 0: Kreuz, halten, noch keine Auswertung', () => {
    const f = calibrationFrame(pts, 0);
    expect(f.pointIndex).toBe(0);
    expect(f.phase).toBe('hold');
    expect(f.sampling).toBe(false);
    expect(f.done).toBe(false);
    expect(f.xDeg).toBe(0);
    expect(f.yDeg).toBe(0);
  });

  it('t = 600: Kreuz, Auswertung läuft (letzte 1000 ms)', () => {
    const f = calibrationFrame(pts, 600);
    expect(f.pointIndex).toBe(0);
    expect(f.phase).toBe('hold');
    expect(f.sampling).toBe(true);
  });

  it('t = 1500 + 750: Punkt 1 gleitet, Position strikt zwischen Kreuz und Ziel', () => {
    const f = calibrationFrame(pts, 1500 + 750);
    const target = pts[1]!;
    expect(f.pointIndex).toBe(1);
    expect(f.phase).toBe('glide');
    expect(f.sampling).toBe(false);
    expect(f.xDeg).toBeLessThan(0);
    expect(f.xDeg).toBeGreaterThan(target.xDeg);
    expect(f.yDeg).toBeGreaterThan(0);
    expect(f.yDeg).toBeLessThan(target.yDeg);
    // Cosinus-Profil: zur Hälfte der Zeit genau auf halbem Weg
    expect(f.xDeg).toBeCloseTo(target.xDeg / 2);
    expect(f.yDeg).toBeCloseTo(target.yDeg / 2);
  });

  it('Gleiten läuft sanft an', () => {
    const target = pts[1]!;
    const early = calibrationFrame(pts, 1500 + 150); // 10 % der Zeit
    expect(Math.abs(early.xDeg)).toBeLessThan(Math.abs(target.xDeg) * 0.1);
  });

  it('t = 1500 + 1500 + 500: Punkt 1 wird am Ziel gehalten', () => {
    const f = calibrationFrame(pts, 1500 + 1500 + 500);
    expect(f.pointIndex).toBe(1);
    expect(f.phase).toBe('hold');
    expect(f.sampling).toBe(true);
    expect(f.xDeg).toBe(pts[1]!.xDeg);
    expect(f.yDeg).toBe(pts[1]!.yDeg);
  });

  it('kurz vor dem Ende: letzter Punkt, Auswertung', () => {
    const f = calibrationFrame(pts, 13499);
    expect(f.pointIndex).toBe(4);
    expect(f.sampling).toBe(true);
    expect(f.done).toBe(false);
  });

  it('done ab calibrationDurationMs', () => {
    expect(calibrationFrame(pts, 13500).done).toBe(true);
    expect(calibrationFrame(pts, 20000).done).toBe(true);
    expect(calibrationFrame(pts, 13500).sampling).toBe(false);
  });
});
