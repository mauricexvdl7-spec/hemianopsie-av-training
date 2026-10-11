import { describe, it, expect } from 'vitest';
import { makeBlock, createBasicPlanner, gridPoints, clampGrid, DEFAULT_GRID, GRID_LIMITS, BLOCK_SIZE } from '../../src/core/blocks';
import { gridSignature } from '../../src/core/controller';
import { createRng } from '../../src/core/rng';
import { makeGeometry, fitsOnScreen } from '../../src/core/geometry';
import { checkTrialPlan, checkGap, stimulusInterval } from '../../src/core/safety';
import { REFERENCE_LEVEL } from '../../src/core/stimulus';

const g = makeGeometry(
  { screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 },
  1200,
  800,
);

describe('makeBlock', () => {
  it('Block hat 14/4/2', () => {
    const b = makeBlock(createRng(1));
    expect(b).toHaveLength(BLOCK_SIZE);
    expect(b.filter((k) => k === 'left')).toHaveLength(14);
    expect(b.filter((k) => k === 'right')).toHaveLength(4);
    expect(b.filter((k) => k === 'catch')).toHaveLength(2);
  });
  it('Reihenfolge ist gemischt', () => {
    const a = makeBlock(createRng(1)).join();
    const b = makeBlock(createRng(2)).join();
    expect(a).not.toBe(b);
  });
});

describe('gridPoints', () => {
  it('links: Raster 3/8/13/… × −90..90 in 15°, alle mit 1° Rand auf dem Bildschirm', () => {
    const pts = gridPoints(g, 'L');
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) {
      expect(fitsOnScreen(g, p.pos, 1)).toBe(true);
      expect(Math.abs((p.pos.eccDeg - 3) % 5)).toBe(0);
      expect(Math.abs(p.pos.angleDeg % 15)).toBe(0);
      expect(p.id).toBe(`L-e${p.pos.eccDeg}-a${p.pos.angleDeg}`);
    }
    expect(pts.some((p) => p.pos.eccDeg === 23 && p.pos.angleDeg === 0)).toBe(true);
  });
  it('rechts kleiner als links (Kreuz nach rechts versetzt)', () => {
    expect(gridPoints(g, 'R').length).toBeLessThan(gridPoints(g, 'L').length);
  });
});

describe('einstellbares Raster', () => {
  it('ohne Angabe oder mit DEFAULT_GRID unverändert', () => {
    expect(DEFAULT_GRID).toEqual({ eccStartDeg: 3, eccStepDeg: 5, angleStepDeg: 15 });
    expect(gridSignature(gridPoints(g, 'L'))).toBe(gridSignature(gridPoints(g, 'L', DEFAULT_GRID)));
    expect(gridSignature(gridPoints(g, 'R'))).toBe(gridSignature(gridPoints(g, 'R', DEFAULT_GRID)));
  });
  it('30°-Raster mit Start 2 und Schritt 4: Winkel Vielfache von 30, Exzentrizitäten 2, 6, 10, …', () => {
    const pts = gridPoints(g, 'L', { eccStartDeg: 2, eccStepDeg: 4, angleStepDeg: 30 });
    expect(pts.length).toBeGreaterThan(5);
    for (const p of pts) {
      expect(Math.abs(p.pos.angleDeg % 30)).toBe(0);
      expect(p.pos.angleDeg).toBeGreaterThanOrEqual(-90);
      expect(p.pos.angleDeg).toBeLessThanOrEqual(90);
      expect((p.pos.eccDeg - 2) % 4).toBe(0);
      expect(p.id).toBe(`L-e${p.pos.eccDeg}-a${p.pos.angleDeg}`);
    }
    expect(pts.some((p) => p.pos.eccDeg === 2)).toBe(true);
    expect(pts.some((p) => p.pos.eccDeg === 6)).toBe(true);
  });
  it('clampGrid: runden, begrenzen, Winkel auf erlaubten Wert', () => {
    expect(clampGrid({ eccStartDeg: 1, eccStepDeg: 9.4, angleStepDeg: 17 })).toEqual({ eccStartDeg: 2, eccStepDeg: 8, angleStepDeg: 15 });
    expect(clampGrid({ eccStartDeg: 9, eccStepDeg: 1, angleStepDeg: 100 })).toEqual({ eccStartDeg: 6, eccStepDeg: 3, angleStepDeg: 30 });
    expect(clampGrid({ eccStartDeg: 3.6 })).toEqual({ ...DEFAULT_GRID, eccStartDeg: 4 });
  });
  it('clampGrid: Gleichstand beim Winkel wählt den kleineren Wert', () => {
    expect(clampGrid({ angleStepDeg: 12.5 }).angleStepDeg).toBe(10);
    expect(clampGrid({ angleStepDeg: 25 }).angleStepDeg).toBe(20);
    expect(clampGrid({ angleStepDeg: 17.5 }).angleStepDeg).toBe(15);
  });
  it('clampGrid: fehlend oder ungültig -> Standard', () => {
    expect(clampGrid(undefined)).toEqual(DEFAULT_GRID);
    expect(clampGrid({})).toEqual(DEFAULT_GRID);
    expect(clampGrid({ eccStartDeg: NaN, angleStepDeg: NaN })).toEqual(DEFAULT_GRID);
    expect(GRID_LIMITS.angleStepDeg).toEqual([10, 15, 20, 30]);
  });
});

describe('createBasicPlanner', () => {
  const ps = (() => {
    const pl = createBasicPlanner(createRng(5), { sessionId: 's', geometry: g, responseWindowMs: 2000 });
    return Array.from({ length: 2000 }, () => pl.next());
  })();

  it('2000 Pläne gültig, Anteile exakt, Orte auf dem Bildschirm, Wartezeit 1500–3500 (Standard)', () => {
    expect(ps.filter((p) => p.kind === 'left')).toHaveLength(1400);
    expect(ps.filter((p) => p.kind === 'right')).toHaveLength(400);
    expect(ps.filter((p) => p.kind === 'catch')).toHaveLength(200);
    for (const p of ps) {
      expect(checkTrialPlan(p)).toEqual([]);
      if (p.pos) expect(fitsOnScreen(g, p.pos, 0)).toBe(true);
      expect(p.waitMs).toBeGreaterThanOrEqual(1500);
      expect(p.waitMs).toBeLessThanOrEqual(3500);
    }
  });

  it('Phase 1 fest: Referenzstufe, Ton gleichzeitig, voller Pegel', () => {
    for (const p of ps) {
      expect(p.phase).toBe('1');
      expect(p.soaMs).toBe(0);
      expect(p.soundGainDb).toBe(0);
      expect(p.rampMs).toBe(150);
      expect(p.plateauMs).toBe(700);
      expect(p.responseWindowMs).toBe(2000);
      if (p.kind === 'catch') {
        expect(p.sound).toBe('none');
        expect(p.level).toBeNull();
      } else {
        expect(p.sound).toBe('sync');
        expect(p.level).toBe(REFERENCE_LEVEL);
      }
    }
  });

  it('IDs und Indizes fortlaufend', () => {
    ps.forEach((p, i) => {
      expect(p.index).toBe(i);
      expect(p.id).toBe(`s-${i}`);
      expect(p.sessionId).toBe('s');
    });
  });

  it('linke Orte links, rechte rechts, ohne Reiz ohne Ort', () => {
    for (const p of ps) {
      if (p.kind === 'left') expect(p.pos!.side).toBe('L');
      if (p.kind === 'right') expect(p.pos!.side).toBe('R');
      if (p.kind === 'catch') {
        expect(p.pos).toBeNull();
        expect(p.gridPointId).toBeNull();
      }
    }
  });

  it('Orte sind um höchstens ~1° vom Rasterpunkt verschoben', () => {
    for (const p of ps) {
      if (!p.pos) continue;
      const m = /^[LR]-e(\d+)-a(-?\d+)$/.exec(p.gridPointId!)!;
      expect(Math.abs(p.pos.eccDeg - Number(m[1]))).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('onlyKind right liefert nur rechte Pläne', () => {
    const pl = createBasicPlanner(createRng(6), { sessionId: 's', geometry: g, responseWindowMs: 2000, onlyKind: 'right' });
    for (let i = 0; i < 100; i++) expect(pl.next().kind).toBe('right');
  });

  it('Abstand zwischen Reizen ≥ 1000 ms bei schnellster Taktung', () => {
    // schnellste Taktung: Durchgang endet am Ende des Reizes (sofortige Antwort), nächster t0 = Ende + waitMs
    let end: number | null = null;
    let t = 0;
    for (const p of ps) {
      const iv = stimulusInterval(p);
      const t0 = t + p.waitMs;
      if (iv) {
        expect(checkGap(end, t0 + iv.startMs)).toEqual([]);
        end = t0 + iv.endMs;
      }
      t = t0 + 2 * p.rampMs + p.plateauMs;
    }
  });

  it('Timing-Optionen: Plateau, Wartezeit; kürzestes Tempo hält trotzdem 1000 ms Abstand', () => {
    const timing = { plateauMs: 300, waitMinMs: 1000, waitMaxMs: 1000, responseWindowMinMs: 1500 };
    const pl = createBasicPlanner(createRng(7), { sessionId: 's', geometry: g, responseWindowMs: 1500, timing });
    const plans = Array.from({ length: 200 }, () => pl.next());
    let end: number | null = null;
    let t = 0;
    for (const p of plans) {
      expect(p.plateauMs).toBe(300);
      expect(p.waitMs).toBe(1000);
      const iv = stimulusInterval(p);
      const t0 = t + p.waitMs;
      if (iv) {
        expect(checkGap(end, t0 + iv.startMs)).toEqual([]);
        end = t0 + iv.endMs;
      }
      t = t0 + 2 * p.rampMs + p.plateauMs;
    }
  });

  it('Timing-Optionen werden geklemmt (Pause nie unter 1000 ms)', () => {
    const pl = createBasicPlanner(createRng(8), { sessionId: 's', geometry: g, responseWindowMs: 2000, timing: { waitMinMs: 0, waitMaxMs: 0 } });
    for (let i = 0; i < 50; i++) expect(pl.next().waitMs).toBe(1000);
  });
});
