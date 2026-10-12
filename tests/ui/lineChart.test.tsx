// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest';
import { render } from 'preact';
import { LineChart, type Series } from '../../src/ui/admin/LineChart';

function mount(series: Series[], count: number, phaseLines: Array<{ index: number; label: string }> = []) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(
    <LineChart
      title="Trefferquote links"
      series={series}
      count={count}
      yMin={0}
      yMax={1}
      yTicks={[0, 0.5, 1]}
      formatY={(v) => `${Math.round(v * 100)} %`}
      phaseLines={phaseLines}
    />,
    root,
  );
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('LineChart', () => {
  it('null unterbricht die Linie, jeder Wert hat einen Kreis', () => {
    const root = mount([{ label: 'gesamt', values: [0.5, null, 0.7, 0.8], color: '#5fb0a9' }], 4);
    const svg = root.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Trefferquote links');
    const paths = root.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect(paths[0]!.getAttribute('d')!.match(/M/g)).toHaveLength(2);
    expect(root.querySelectorAll('circle')).toHaveLength(3);
    expect(root.textContent).toContain('gesamt');
    expect(root.textContent).toContain('100 %');
  });

  it('Phasenlinien: senkrecht, gestrichelt, beschriftet', () => {
    const root = mount([{ label: 'gesamt', values: [0.5, 0.6, 0.7, 0.8], color: '#5fb0a9' }], 4, [
      { index: 1, label: '2' },
      { index: 3, label: '3a' },
    ]);
    const lines = [...root.querySelectorAll('line.phase-line')];
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(l.getAttribute('x1')).toBe(l.getAttribute('x2'));
      expect(l.getAttribute('stroke-dasharray')).toBeTruthy();
    }
    expect(root.textContent).toContain('Phase 2');
    expect(root.textContent).toContain('Phase 3a');
  });

  it('weniger als zwei Sitzungen: Hinweis statt Diagramm', () => {
    const root = mount([{ label: 'gesamt', values: [0.5], color: '#5fb0a9' }], 1);
    expect(root.querySelector('svg')).toBeNull();
    expect(root.textContent).toContain('Noch zu wenige Sitzungen.');
  });
});
