// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { gridPoints } from '../../src/core/blocks';
import { gridSignature } from '../../src/core/controller';
import { makeGeometry } from '../../src/core/geometry';
import { createRng } from '../../src/core/rng';
import { openDb, DEFAULT_GEOMETRY } from '../../src/store/db';
import { planningGeometry } from '../../src/ui/browserDeps';
import { startTrainingSession } from '../../src/ui/session';
import { viewportMatches } from '../../src/ui/validate';
import { fakeDeps } from '../helpers/fakeRunner';

const SETUP = { width: 1180, height: 820 };
// Beide Fenster liegen innerhalb von ±2 % der Einrichtung (Training erlaubt), ergeben aber verschiedene Raster.
const LIVE_A = { width: 1180, height: 820 };
const LIVE_B = { width: 1164, height: 804 };
const sig = (w: number, h: number) => gridSignature(gridPoints(makeGeometry(DEFAULT_GEOMETRY, w, h), 'L'));

describe('planningGeometry (Planung aus der Einrichtung, nicht aus dem Live-Fenster)', () => {
  it('Voraussetzung: beide Fenster sind erlaubt, würden aber verschiedene Raster ergeben', () => {
    expect(viewportMatches(SETUP, LIVE_A.width, LIVE_A.height)).toBe(true);
    expect(viewportMatches(SETUP, LIVE_B.width, LIVE_B.height)).toBe(true);
    expect(sig(LIVE_A.width, LIVE_A.height)).not.toBe(sig(LIVE_B.width, LIVE_B.height));
  });

  it('mit Einrichtungsfenster: Rastersignatur hängt nicht vom Live-Fenster ab', () => {
    const a = planningGeometry(DEFAULT_GEOMETRY, SETUP);
    expect(a.viewportWidthPx).toBe(SETUP.width);
    expect(a.viewportHeightPx).toBe(SETUP.height);
    expect(gridSignature(gridPoints(a, 'L'))).toBe(sig(SETUP.width, SETUP.height));
  });

  it('ohne Einrichtungsfenster: das Live-Fenster', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });
    const g = planningGeometry(DEFAULT_GEOMETRY, null);
    expect([g.viewportWidthPx, g.viewportHeightPx]).toEqual([1000, 700]);
  });

  it('zwei Sitzungen in verschiedenen erlaubten Fenstern: keine gridChanged-Sicherung, Karte bleibt', async () => {
    const db = await openDb('planning-geometry');
    const run = async (id: string, live: { width: number; height: number }) => {
      Object.defineProperty(window, 'innerWidth', { value: live.width, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: live.height, configurable: true });
      const ts = await startTrainingSession({
        db,
        deps: fakeDeps().deps,
        geometry: planningGeometry(DEFAULT_GEOMETRY, SETUP),
        responseWindowMs: 2000,
        trials: 0,
        sessionId: id,
        now: () => new Date(Date.UTC(2026, 9, 11, 10, 0, 0)),
        rng: createRng(1),
      });
      await ts.finish();
    };
    await run('s1', LIVE_A);
    const first = (await db.getController())!;
    await run('s2', LIVE_B);
    const snaps = await db.listMapSnapshots();
    expect(snaps.some((s) => s.reason === 'gridChanged')).toBe(false);
    expect((await db.getController())!.gridSignature).toBe(first.gridSignature);
  });
});
