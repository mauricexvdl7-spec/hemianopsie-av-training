/** Farbskala der Schwellen-Karte (Admin-Ansicht): dunkelgrau über gedämpftes Blau bis hellgelb. */

const STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [0x4a, 0x4a, 0x4a],
  [0x3f, 0x6f, 0x9f],
  [0xe8, 0xd8, 0x70],
];

const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');

/** p 0..1 → Farbe; lineare Mischung durch drei Stützfarben, Helligkeit steigt monoton, nie Schwarz oder Weiß. */
export function heatColor(p: number): string {
  const q = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  const x = q * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = STOPS[i]!;
  const b = STOPS[i + 1]!;
  return `#${hex(a[0] + (b[0] - a[0]) * f)}${hex(a[1] + (b[1] - a[1]) * f)}${hex(a[2] + (b[2] - a[2]) * f)}`;
}

/** Größte dargestellte Schwelle; darüber ist ein Ort mit keiner Stufe sichtbar. */
export const THRESHOLD_COLOR_MAX = 14;

/** Farbe für eine Schwelle θ̄ (Stufen): 1 − θ̄/14, d. h. niedrige Schwelle (gut sichtbar) hell. */
export function thresholdColor(theta: number): string {
  return heatColor(1 - theta / THRESHOLD_COLOR_MAX);
}
