import { describe, it, expect } from 'vitest';
import { diffColor, heatColor, thresholdColor } from '../../src/ui/mapColors';

/** Relative Leuchtdichte nach WCAG aus #rrggbb. */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

describe('heatColor', () => {
  it('Endpunkte: dunkelgrau und hellgelb', () => {
    expect(heatColor(0)).toBe('#4a4a4a');
    expect(heatColor(1)).toBe('#e8d870');
  });

  it('Helligkeit steigt über 11 Stützstellen streng monoton', () => {
    const lum = Array.from({ length: 11 }, (_, k) => luminance(heatColor(k / 10)));
    for (let k = 1; k < lum.length; k++) expect(lum[k]!).toBeGreaterThan(lum[k - 1]!);
  });

  it('nie Schwarz oder Weiß, immer gültiges Hex', () => {
    for (let k = 0; k <= 100; k++) {
      const c = heatColor(k / 100);
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(c).not.toBe('#000000');
      expect(c).not.toBe('#ffffff');
    }
  });

  it('Werte außerhalb von 0..1 werden begrenzt', () => {
    expect(heatColor(-3)).toBe('#4a4a4a');
    expect(heatColor(7)).toBe('#e8d870');
    expect(heatColor(Number.NaN)).toBe('#4a4a4a');
  });
});

describe('thresholdColor', () => {
  it('Schwelle 0 hell, Schwelle 14 und höher dunkel; Werte unter 0 begrenzt', () => {
    expect(thresholdColor(0)).toBe('#e8d870');
    expect(thresholdColor(14)).toBe('#4a4a4a');
    expect(thresholdColor(20)).toBe('#4a4a4a');
    expect(thresholdColor(-1)).toBe('#e8d870');
    expect(thresholdColor(7)).toBe(heatColor(0.5));
  });
});

describe('diffColor', () => {
  it('0 neutral, geklemmt auf [−1, 1], Richtungen unterscheidbar', () => {
    expect(diffColor(0)).toBe(diffColor(-0));
    expect(diffColor(2)).toBe(diffColor(1));
    expect(diffColor(-5)).toBe(diffColor(-1));
    expect(diffColor(1)).not.toBe(diffColor(-1));
    expect(diffColor(1)).not.toBe(diffColor(0));
    expect(diffColor(Number.NaN)).toBe(diffColor(0));
    for (const v of [-1, -0.5, 0, 0.5, 1]) expect(diffColor(v)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
