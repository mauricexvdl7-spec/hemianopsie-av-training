// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from 'preact';
import { createControllerState } from '../../src/core/controller';
import { makeGeometry } from '../../src/core/geometry';
import { MapView, cellsFromMap, diffCells, type MapCell } from '../../src/ui/admin/MapView';
import { diffColor, heatColor, thresholdColor } from '../../src/ui/mapColors';

const g = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820);

function mount(mode: 'prob' | 'theta') {
  const state = createControllerState(g);
  const cells = cellsFromMap(state.map, state.guess);
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(<MapView title="Testkarte" cells={cells} mode={mode} />, root);
  return { root, cells };
}

describe('MapView', () => {
  it('ein Kreis je Rasterpunkt, Titel und Legende deutsch', () => {
    const { root, cells } = mount('prob');
    expect(root.querySelectorAll('circle')).toHaveLength(cells.length);
    expect(root.textContent).toContain('Testkarte');
    expect(root.textContent).toContain('Fixationskreuz');
    expect(root.textContent).toContain('100 %');
  });

  it('Farbe: Trefferwahrscheinlichkeit bzw. Schwelle', () => {
    const prob = mount('prob');
    const first = prob.cells[0]!;
    // Leere Karte: gleichverteilter Posterior, überall dieselbe Farbe.
    expect(prob.root.querySelector('circle')!.getAttribute('fill')).toBe(heatColor(first.p));
    const theta = mount('theta');
    expect(theta.root.querySelector('circle')!.getAttribute('fill')).toBe(thresholdColor(theta.cells[0]!.theta));
    expect(theta.root.textContent).toContain('Schwelle 14');
  });

  it('Kreise liegen links vom Kreuz und im Bild', () => {
    const { root } = mount('prob');
    const svg = root.querySelector('svg')!;
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const fixX = w! - 36;
    for (const c of Array.from(root.querySelectorAll('circle'))) {
      const x = Number(c.getAttribute('cx'));
      const y = Number(c.getAttribute('cy'));
      expect(x).toBeLessThanOrEqual(fixX);
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(h!);
    }
  });
});

const cell = (id: string, p: number, theta: number): MapCell => ({ id, pos: { side: 'L', eccDeg: 8, angleDeg: 0 }, p, theta });

describe('diffCells', () => {
  it('gleiche IDs: Differenz je Punkt (spätere minus frühere Karte)', () => {
    const d = diffCells([cell('a', 0.2, 9), cell('b', 0.5, 6)], [cell('a', 0.6, 7), cell('b', 0.4, 6.5)])!;
    expect(d.map((c) => c.id)).toEqual(['a', 'b']);
    expect(d[0]!.p).toBeCloseTo(0.4, 12);
    expect(d[0]!.theta).toBeCloseTo(-2, 12);
    expect(d[1]!.p).toBeCloseTo(-0.1, 12);
    expect(d[1]!.theta).toBeCloseTo(0.5, 12);
  });

  it('andere IDs (Raster geändert): null', () => {
    expect(diffCells([cell('a', 0.2, 9)], [cell('x', 0.6, 7)])).toBeNull();
    expect(diffCells([cell('a', 0.2, 9)], [cell('a', 0.6, 7), cell('b', 0.4, 6)])).toBeNull();
  });
});

describe('MapView mit Differenz', () => {
  function mountDiff(mode: 'prob' | 'theta', c: MapCell) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(<MapView title="Vergleich" cells={[c]} mode={mode} diff />, root);
    return root;
  }

  it('prob: Verbesserung = Δp, theta: Verbesserung = −Δθ / 4, geklemmt; Legende schlechter – gleich – besser', () => {
    const prob = mountDiff('prob', cell('a', 0.3, 0));
    expect(prob.querySelector('circle')!.getAttribute('fill')).toBe(diffColor(0.3));
    expect(prob.textContent).toContain('schlechter');
    expect(prob.textContent).toContain('gleich');
    expect(prob.textContent).toContain('besser');
    const theta = mountDiff('theta', cell('a', 0, -2));
    expect(theta.querySelector('circle')!.getAttribute('fill')).toBe(diffColor(0.5));
    const far = mountDiff('theta', cell('a', 0, 12));
    expect(far.querySelector('circle')!.getAttribute('fill')).toBe(diffColor(-1));
  });
});
