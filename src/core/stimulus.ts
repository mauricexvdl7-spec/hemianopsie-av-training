/**
 * Reizstufen, zeitliche Hüllkurve und Pixelbild des Gauß-Lichtflecks.
 * Kontrast ist Weber-Kontrast gegen den Hintergrund (#3c3c3c), gerechnet in linearem Licht.
 */

export const LEVEL_COUNT = 12;
export const REFERENCE_LEVEL = 6;
export const CONTRAST_MIN = 0.05;
export const CONTRAST_CAP = 4.0;
export const SIGMA_BASE_DEG = 0.5;
export const SIGMA_MAX_DEG = 1.5;
export const BG_SRGB = 0x3c;
export const RAMP_MS = 150;
/** Standard-Plateau; einstellbar über `TimingSettings.plateauMs` (siehe timing.ts). */
export const PLATEAU_MS = 700;

/** Stufen 0–8: Kontrast logarithmisch von 0,05 bis 4,0 bei σ = 0,5°. Stufen 9–11: Kontrast 4,0, σ wächst bis 1,5°. */
export function levelParams(level: number): { contrast: number; sigmaDeg: number } {
  if (!Number.isInteger(level) || level < 0 || level >= LEVEL_COUNT) {
    throw new RangeError(`Ungültige Reizstufe: ${level}`);
  }
  if (level <= 8) {
    return { contrast: CONTRAST_MIN * (CONTRAST_CAP / CONTRAST_MIN) ** (level / 8), sigmaDeg: SIGMA_BASE_DEG };
  }
  return { contrast: CONTRAST_CAP, sigmaDeg: SIGMA_BASE_DEG * 3 ** ((level - 8) / 3) };
}

/** Hüllkurve 0..1: Cosinus-Rampe hoch, Plateau, Cosinus-Rampe runter; außerhalb 0. */
export function envelope(tMs: number, rampMs: number, plateauMs: number): number {
  const total = 2 * rampMs + plateauMs;
  if (tMs <= 0 || tMs >= total) return 0;
  if (tMs < rampMs) return 0.5 - 0.5 * Math.cos((Math.PI * tMs) / rampMs);
  if (tMs <= rampMs + plateauMs) return 1;
  const down = tMs - rampMs - plateauMs;
  return 0.5 + 0.5 * Math.cos((Math.PI * down) / rampMs);
}

export function srgbToLinear(v8: number): number {
  const v = v8 / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Linear → sRGB-Wert 0..255 (nicht gerundet). */
export function linearToSrgb(l: number): number {
  const c = Math.min(1, Math.max(0, l));
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return v * 255;
}

const BG_LINEAR = srgbToLinear(BG_SRGB);

/**
 * Quadratisches RGBA-Bild des Lichtflecks, Kantenlänge 2·ceil(3σ)+1.
 * Das Gauß-Profil wird um seinen Randwert abgesenkt, damit der Patch-Rand exakt Hintergrund ist.
 */
export function renderBlobPatch(sigmaPx: number, contrast: number, gain: number): { size: number; rgba: Uint8ClampedArray } {
  const half = Math.ceil(3 * sigmaPx);
  const size = 2 * half + 1;
  const rgba = new Uint8ClampedArray(size * size * 4);
  const edge = Math.exp(-(half * half) / (2 * sigmaPx * sigmaPx));
  const amp = contrast * gain;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - half;
      const dy = y - half;
      const g = Math.max(0, (Math.exp(-(dx * dx + dy * dy) / (2 * sigmaPx * sigmaPx)) - edge) / (1 - edge));
      const v = Math.round(linearToSrgb(BG_LINEAR * (1 + amp * g)));
      const i = (y * size + x) * 4;
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
      rgba[i + 3] = 255;
    }
  }
  return { size, rgba };
}
