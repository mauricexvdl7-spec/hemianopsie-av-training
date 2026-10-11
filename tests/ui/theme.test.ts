import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { TOKENS, contrastRatio } from '../../src/ui/theme';

const css = readFileSync(resolve(__dirname, '../../src/styles.css'), 'utf8');

/** Alle Custom Properties im ersten :root-Block von styles.css. */
function rootVars(): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css);
  expect(block).not.toBeNull();
  const out: Record<string, string> = {};
  for (const m of block![1]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim().replace(/\s+/g, ' ');
  return out;
}

describe('Design-Tokens', () => {
  it('theme.ts und styles.css (:root) stimmen exakt überein', () => {
    expect(rootVars()).toEqual(TOKENS);
  });

  it('Hintergrund aller Bildschirme bleibt #3c3c3c', () => {
    expect(TOKENS['--bg']).toBe('#3c3c3c');
  });

  it('kein reines Schwarz oder Weiß', () => {
    for (const v of Object.values(TOKENS)) expect(v.toLowerCase()).not.toMatch(/#(000000|ffffff|000|fff)\b/);
    expect(css.toLowerCase()).not.toMatch(/#(000000|ffffff|000|fff)\b/);
    // Farbwörter, nicht „white-space“
    expect(css.toLowerCase()).not.toMatch(/(?<![-\w])(black|white)(?![-\w])/);
  });
});

describe('Kontraste (WCAG)', () => {
  it('Rechnung stimmt an bekannten Werten', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#fff', '#ffffff')).toBeCloseTo(1, 6);
    expect(contrastRatio('#3c3c3c', '#3c3c3c')).toBeCloseTo(1, 6);
  });

  it('Text für ihn ≥ 7:1 auf Hintergrund und Karte', () => {
    expect(contrastRatio(TOKENS['--text'], TOKENS['--bg'])).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(TOKENS['--text'], TOKENS['--surface'])).toBeGreaterThanOrEqual(7);
  });

  it('Hinweistext (gedämpft) ≥ 4,5:1 auf Karte und Hintergrund', () => {
    expect(contrastRatio(TOKENS['--muted'], TOKENS['--surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(TOKENS['--muted'], TOKENS['--bg'])).toBeGreaterThanOrEqual(4.5);
  });

  it('Text auf Petrol ≥ 4,5:1', () => {
    expect(contrastRatio(TOKENS['--accent-ink'], TOKENS['--accent'])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(TOKENS['--accent-ink'], TOKENS['--accent-strong'])).toBeGreaterThanOrEqual(4.5);
  });

  it('Fehlertext ≥ 4,5:1 auf der Karte', () => {
    expect(contrastRatio(TOKENS['--danger'], TOKENS['--surface'])).toBeGreaterThanOrEqual(4.5);
  });
});
