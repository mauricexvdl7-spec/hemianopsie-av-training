import { describe, it, expect } from 'vitest';
import {
  levelParams,
  envelope,
  srgbToLinear,
  linearToSrgb,
  renderBlobPatch,
  LEVEL_COUNT,
  REFERENCE_LEVEL,
  CONTRAST_CAP,
  BG_SRGB,
} from '../../src/core/stimulus';

describe('Reizstufen', () => {
  it('12 Stufen, Referenz 6', () => {
    expect(LEVEL_COUNT).toBe(12);
    expect(REFERENCE_LEVEL).toBe(6);
  });

  it('Stufe 0 und 8', () => {
    expect(levelParams(0).contrast).toBeCloseTo(0.05);
    expect(levelParams(0).sigmaDeg).toBe(0.75);
    expect(levelParams(8).contrast).toBeCloseTo(12);
    expect(levelParams(8).sigmaDeg).toBe(0.75);
  });

  it('Stufe 11 = Deckel', () => {
    const p = levelParams(11);
    expect(p.contrast).toBeCloseTo(12);
    expect(p.sigmaDeg).toBeCloseTo(1.5);
  });

  it('hellstes Licht etwa 200 von 255 (gut sichtbar am Monitor, aber kein reines Weiß, dunkler als der Text #e0e0e0)', () => {
    const peak = linearToSrgb(srgbToLinear(BG_SRGB) * (1 + CONTRAST_CAP));
    expect(peak).toBeGreaterThan(195);
    expect(peak).toBeLessThan(205);
    expect(peak).toBeLessThan(0xe0);
  });

  it('Stufen monoton', () => {
    for (let l = 1; l < 12; l++) {
      const a = levelParams(l - 1);
      const b = levelParams(l);
      expect(b.contrast * b.sigmaDeg ** 2).toBeGreaterThan(a.contrast * a.sigmaDeg ** 2);
    }
  });

  it('wirft außerhalb 0..11 und bei Nicht-Ganzzahlen', () => {
    expect(() => levelParams(12)).toThrow();
    expect(() => levelParams(-1)).toThrow();
    expect(() => levelParams(2.5)).toThrow();
  });
});

describe('Hüllkurve', () => {
  it('Cosinus-Rampen und Plateau', () => {
    expect(envelope(-1, 150, 300)).toBe(0);
    expect(envelope(0, 150, 300)).toBe(0);
    expect(envelope(75, 150, 300)).toBeCloseTo(0.5);
    expect(envelope(150, 150, 300)).toBe(1);
    expect(envelope(449, 150, 300)).toBe(1);
    expect(envelope(525, 150, 300)).toBeCloseTo(0.5);
    expect(envelope(600, 150, 300)).toBe(0);
    expect(envelope(700, 150, 300)).toBe(0);
  });
});

describe('Blob-Patch', () => {
  it('sRGB hin und zurück', () => {
    for (const v of [0, 60, 128, 255]) expect(Math.round(linearToSrgb(srgbToLinear(v)))).toBe(v);
  });

  it('Mitte heller, Rand = Hintergrund, nie weiß', () => {
    const { size, rgba } = renderBlobPatch(10, 4.0, 1);
    const c = ((size >> 1) * size + (size >> 1)) * 4;
    expect(rgba[c]).toBeGreaterThan(0x3c);
    expect(rgba[c]).toBeLessThan(255);
    expect(rgba[0]).toBe(0x3c);
    expect(rgba[3]).toBe(255);
  });

  it('Kantenlänge 2·ceil(3σ)+1', () => {
    expect(renderBlobPatch(10, 1, 1).size).toBe(61);
    expect(renderBlobPatch(2.2, 1, 1).size).toBe(15);
  });

  it('bei gain 0 reiner Hintergrund', () => {
    const { rgba } = renderBlobPatch(5, 4.0, 0);
    for (let i = 0; i < rgba.length; i += 4) expect(rgba[i]).toBe(0x3c);
  });
});
