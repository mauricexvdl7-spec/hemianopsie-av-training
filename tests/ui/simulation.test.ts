import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { makeGeometry } from '../../src/core/geometry';
import { gridPoints } from '../../src/core/blocks';
import { openDb } from '../../src/store/db';
import { simulateMap } from '../../src/ui/admin/simulation';

const g = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820);

describe('simulateMap', () => {
  it('liefert Schätzung und wahre Karte über dieselben Punkte, RMSE ≤ 1,5, schreibt nichts', async () => {
    const db = await openDb('simulation-db');
    const res = simulateMap(g, 101);
    const n = gridPoints(g, 'L').length;
    expect(res.estimate).toHaveLength(n);
    expect(res.truth.map((c) => c.id)).toEqual(res.estimate.map((c) => c.id));
    expect(res.rmsePoints).toBeGreaterThan(10);
    expect(res.rmse).not.toBeNull();
    expect(res.rmse!).toBeLessThanOrEqual(1.5);
    expect(await db.getController()).toBeNull();
    expect(await db.listSessions()).toHaveLength(0);
    expect(await db.listMapSnapshots()).toHaveLength(0);
  }, 30_000);
});
