/**
 * Ablauf der Kalibrierung als reiner Plan: Punkte, Gleitbahnen, Auswertefenster.
 * Koordinaten in Grad relativ zum Kreuz: x horizontal (negativ = links), y vertikal (positiv = oben).
 * Die Umrechnung in Pixel macht die UI mit `toVisualPos` und `visualToPx` aus core/geometry.
 */
import { fitsOnScreen, maxEccentricityDeg, pxToVisual, type Geometry } from './geometry';
import type { VisualPos } from './types';

export const CALIB_GLIDE_MS = 1500;
export const CALIB_HOLD_MS = 1500;
/** Ausgewertet werden die letzten CALIB_SAMPLE_MS des Haltens. */
export const CALIB_SAMPLE_MS = 1000;
export const CALIB_MARGIN_DEG = 1.5;

export interface CalibPoint {
  id: 'center' | 'leftUp' | 'leftDown' | 'rightUp' | 'rightDown';
  xDeg: number;
  yDeg: number;
}

const RAD = Math.PI / 180;

/** (x, y) in Grad → Ort im Gesichtsfeld (Polarform: Exzentrizität = Betrag, Winkel zur Horizontalen). */
export function toVisualPos(xDeg: number, yDeg: number): VisualPos {
  return {
    side: xDeg < 0 ? 'L' : 'R',
    eccDeg: Math.hypot(xDeg, yDeg),
    angleDeg: Math.atan2(yDeg, Math.abs(xDeg)) / RAD,
  };
}

function fromVisualPos(p: VisualPos): { xDeg: number; yDeg: number } {
  const s = p.side === 'L' ? -1 : 1;
  return { xDeg: s * p.eccDeg * Math.cos(p.angleDeg * RAD), yDeg: p.eccDeg * Math.sin(p.angleDeg * RAD) };
}

/**
 * Das Kreuz, dann die vier Ecken des nutzbaren Bereichs: in Richtung der Bildschirmecken,
 * bei maximaler Ausdehnung minus CALIB_MARGIN_DEG.
 * Reihenfolge: center, leftUp, leftDown, rightUp, rightDown.
 */
export function calibrationPoints(g: Geometry): CalibPoint[] {
  const w = g.viewportWidthPx;
  const h = g.viewportHeightPx;
  const corners: { id: CalibPoint['id']; x: number; y: number }[] = [
    { id: 'leftUp', x: 0, y: 0 },
    { id: 'leftDown', x: 0, y: h },
    { id: 'rightUp', x: w, y: 0 },
    { id: 'rightDown', x: w, y: h },
  ];
  const points: CalibPoint[] = [{ id: 'center', xDeg: 0, yDeg: 0 }];
  for (const c of corners) {
    const dir = pxToVisual(g, c.x, c.y);
    const eccDeg = Math.max(0, maxEccentricityDeg(g, dir.side, dir.angleDeg) - CALIB_MARGIN_DEG);
    const pos: VisualPos = { side: dir.side, eccDeg, angleDeg: dir.angleDeg };
    // Bei sehr kleinem Bildschirm bleibt der Punkt am Kreuz statt außerhalb.
    const { xDeg, yDeg } = fitsOnScreen(g, pos, 0) ? fromVisualPos(pos) : { xDeg: 0, yDeg: 0 };
    points.push({ id: c.id, xDeg, yDeg });
  }
  return points;
}

export interface CalibFrame {
  pointIndex: number;
  xDeg: number;
  yDeg: number;
  phase: 'glide' | 'hold';
  /** true in den letzten CALIB_SAMPLE_MS des Haltens: Merkmale dieses Bilds zählen für den Punkt. */
  sampling: boolean;
  done: boolean;
}

function glideMs(p: CalibPoint): number {
  return p.id === 'center' ? 0 : CALIB_GLIDE_MS;
}

export function calibrationDurationMs(points: readonly CalibPoint[]): number {
  return points.reduce((sum, p) => sum + glideMs(p) + CALIB_HOLD_MS, 0);
}

/**
 * Position zum Zeitpunkt tMs ab Beginn; center hat keine Gleitphase.
 * Gleiten vom Kreuz zum Ziel mit Cosinus-Profil (sanft an- und auslaufend).
 * Ab der Gesamtdauer: done, letzter Punkt am Ziel, keine Auswertung.
 */
export function calibrationFrame(points: readonly CalibPoint[], tMs: number): CalibFrame {
  let start = 0;
  const t = Math.max(0, tMs);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const glide = glideMs(p);
    const end = start + glide + CALIB_HOLD_MS;
    if (t < end) {
      const local = t - start;
      if (local < glide) {
        const s = (1 - Math.cos((Math.PI * local) / glide)) / 2;
        return { pointIndex: i, xDeg: p.xDeg * s, yDeg: p.yDeg * s, phase: 'glide', sampling: false, done: false };
      }
      const held = local - glide;
      return {
        pointIndex: i,
        xDeg: p.xDeg,
        yDeg: p.yDeg,
        phase: 'hold',
        sampling: held >= CALIB_HOLD_MS - CALIB_SAMPLE_MS,
        done: false,
      };
    }
    start = end;
  }
  const last = points[points.length - 1];
  return {
    pointIndex: points.length - 1,
    xDeg: last?.xDeg ?? 0,
    yDeg: last?.yDeg ?? 0,
    phase: 'hold',
    sampling: false,
    done: true,
  };
}
