// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { gridPoints } from '../../src/core/blocks';
import { createControllerState, gridSignature } from '../../src/core/controller';
import { makeGeometry } from '../../src/core/geometry';
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, openDb } from '../../src/store/db';
import { applyGrid, applySessionMinutes, loadOrCreateController, withHalfLife, withManualStage } from '../../src/ui/admin/settingsActions';

let n = 0;
const g = makeGeometry(DEFAULT_GEOMETRY, 1200, 800);

describe('applySessionMinutes', () => {
  it('begrenzt auf 10–30 Minuten', () => {
    expect(applySessionMinutes(DEFAULT_SETTINGS, 45).sessionMinutes).toBe(30);
    expect(applySessionMinutes(DEFAULT_SETTINGS, 5).sessionMinutes).toBe(10);
    expect(applySessionMinutes(DEFAULT_SETTINGS, 20).sessionMinutes).toBe(20);
  });
});

describe('applyGrid', () => {
  it('ändert nur die genannten Felder und begrenzt', () => {
    expect(applyGrid(DEFAULT_SETTINGS, { angleStepDeg: 30 }).grid).toEqual({ eccStartDeg: 3, eccStepDeg: 5, angleStepDeg: 30 });
    expect(applyGrid(DEFAULT_SETTINGS, { eccStartDeg: 99 }).grid.eccStartDeg).toBe(6);
  });
});

describe('withManualStage', () => {
  it('setzt die Stufe, schreibt den Eintrag und lässt die Eingabe unverändert', () => {
    const c = createControllerState(g);
    const copy = structuredClone(c);
    const iso = '2026-10-12T08:00:00.000Z';
    const out = withManualStage(c, '3a', iso);
    expect(out.phase.stage).toBe('3a');
    expect(out.phase.log.at(-1)).toEqual({ from: '1', to: '3a', reason: 'manual', atIso: iso });
    expect(c).toEqual(copy);
  });
});

describe('withHalfLife', () => {
  it('rundet und begrenzt auf 3–20', () => {
    const c = createControllerState(g);
    expect(withHalfLife(c, 2.4).halfLifeSessions).toBe(3);
    expect(withHalfLife(c, 50).halfLifeSessions).toBe(20);
    expect(withHalfLife(c, 7.6).halfLifeSessions).toBe(8);
    expect(withHalfLife(c, Number.NaN).halfLifeSessions).toBe(c.halfLifeSessions);
  });
});

describe('loadOrCreateController', () => {
  it('legt ohne gespeicherten Controller einen an, passend zum Raster der Einstellungen', async () => {
    const db = await openDb(`settings-actions-${n++}`);
    const s = { ...DEFAULT_SETTINGS, geometry: DEFAULT_GEOMETRY, setupViewport: { width: 1200, height: 800 }, grid: { eccStartDeg: 4, eccStepDeg: 5, angleStepDeg: 30 } };
    const c = await loadOrCreateController(db, s);
    expect(c).not.toBeNull();
    expect(c!.gridSignature).toBe(gridSignature(gridPoints(g, 'L', s.grid)));
  });
  it('gibt einen gespeicherten Controller unverändert zurück', async () => {
    const db = await openDb(`settings-actions-${n++}`);
    const stored = withManualStage(createControllerState(g), '2', '2026-10-12T08:00:00.000Z');
    await db.saveController(stored);
    const c = await loadOrCreateController(db, { ...DEFAULT_SETTINGS, geometry: DEFAULT_GEOMETRY });
    expect(c?.phase.stage).toBe('2');
  });
  it('ohne Geometrie und ohne Controller: null', async () => {
    const db = await openDb(`settings-actions-${n++}`);
    expect(await loadOrCreateController(db, DEFAULT_SETTINGS)).toBeNull();
  });
});
