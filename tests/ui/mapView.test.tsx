// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from 'preact';
import { createControllerState } from '../../src/core/controller';
import { makeGeometry } from '../../src/core/geometry';
import { MapView, cellsFromMap } from '../../src/ui/admin/MapView';
import { heatColor, thresholdColor } from '../../src/ui/mapColors';

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
