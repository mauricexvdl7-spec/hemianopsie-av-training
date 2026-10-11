/**
 * Design-Tokens (Entscheidung 9: ruhig, warm, Akzent gedämpftes Petrol). Dieselben Werte stehen als
 * CSS-Variablen in `:root` von styles.css; ein Test hält beide Listen gleich und prüft die Kontraste.
 * Hintergrund aller Bildschirme bleibt #3c3c3c (keine Helligkeitssprünge), kein reines Schwarz oder Weiß.
 */
export const TOKENS = {
  '--bg': '#3c3c3c',
  '--surface': '#454545',
  '--surface-2': '#4f4f4f',
  '--border': '#5c5c5c',
  '--text': '#e6e6e6',
  '--muted': '#b8b8b8',
  '--accent': '#4f9a94',
  '--accent-strong': '#5fb0a9',
  '--accent-ink': '#0d2b28', // Brief: #10302d (4,3:1 auf --accent); minimal abgedunkelt für ≥ 4,5:1
  '--accent-glow': 'rgba(79, 154, 148, 0.28)',
  '--danger': '#f0b0a0',
  '--radius': '14px',
  '--radius-round': '999px',
  '--shadow': '0 6px 24px rgba(0, 0, 0, 0.25)',
} as const;

export type TokenName = keyof typeof TOKENS;

/** Wert eines Tokens, z. B. für SVG-Attribute, die keine CSS-Variablen kennen. */
export function token(name: TokenName): string {
  return TOKENS[name];
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative Leuchtdichte nach WCAG 2.x für #rrggbb oder #rgb. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** Kontrastverhältnis zweier Farben (1 bis 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
