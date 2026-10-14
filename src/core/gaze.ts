/**
 * Blickmathematik: Merkmale aus den Gesichtspunkten von MediaPipe, Kalibrierfit nach kleinsten
 * Quadraten, Restfehler und Abbildung auf Blickwinkel (Grad relativ zum Kreuz, x links negativ,
 * y oben positiv). Rein: keine Uhr, kein Zufall, kein DOM.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Normierte Merkmale eines Kamerabilds.
 * - irisX: Iris relativ zur Mitte der Augenwinkel, in halben Augenbreiten, positiv in Bild-x-Richtung.
 * - irisY: Iris relativ zur Mitte der Lider, in halben Lidspalten, positiv Richtung Oberlid.
 * - yaw: Nase relativ zur Gesichtsmitte (234/454), in Gesichtsbreiten, positiv in Bild-x-Richtung.
 * - pitch: Nase relativ zur Mitte Stirn/Kinn (10/152), in Gesichtshöhen, positiv in Bild-y-Richtung (nach unten).
 * Die Vorzeichen müssen nicht zur Blickrichtung passen; die Kalibrierung lernt sie.
 */
export interface GazeFeatures {
  irisX: number;
  irisY: number;
  yaw: number;
  pitch: number;
}

const LANDMARK_COUNT = 478;
/** Iris, Augenwinkel (Achse in Bild-x-Richtung), Lider (oben, unten) je Auge. */
const EYES = [
  { iris: 468, cornerA: 33, cornerB: 133, lidUp: 159, lidDown: 145 },
  { iris: 473, cornerA: 362, cornerB: 263, lidUp: 386, lidDown: 374 },
] as const;
const NOSE = 1;
const FACE_LEFT = 234;
const FACE_RIGHT = 454;
const FOREHEAD = 10;
const CHIN = 152;
/** Lidspalte unter diesem Anteil der Augenbreite gilt als geschlossenes Auge (Lidschlag). */
const MIN_LID_OPENING_RATIO = 0.1;
const EPS = 1e-9;

/** Anteil der Projektion von p − Mitte(a, b) auf die Achse a→b, in halben Abständen |ab|. */
function axisOffset(p: Point3, a: Point3, b: Point3): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const len2 = ux * ux + uy * uy;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return (2 * ((p.x - mx) * ux + (p.y - my) * uy)) / len2;
}

function dist(a: Point3, b: Point3): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * MediaPipe-Indizes: Iris 468 und 473; Augenwinkel 33/133 und 362/263; Lider 159/145 und 386/374;
 * Nase 1; Gesichtsrand 234/454; Stirn 10, Kinn 152. null bei weniger als 478 Punkten oder
 * entarteten Augen (Augenwinkel aufeinander, Lidspalte unter 10 % der Augenbreite).
 */
export function featuresFromLandmarks(lm: readonly Point3[]): GazeFeatures | null {
  if (lm.length < LANDMARK_COUNT) return null;
  const at = (i: number): Point3 => lm[i]!;

  let sumX = 0;
  let sumY = 0;
  for (const e of EYES) {
    const ca = at(e.cornerA);
    const cb = at(e.cornerB);
    // Unteres → oberes Lid, damit irisY > 0 „Richtung Oberlid“ bedeutet.
    const lu = at(e.lidUp);
    const ld = at(e.lidDown);
    const width = dist(ca, cb);
    const opening = dist(ld, lu);
    if (!(width > EPS) || !(opening >= MIN_LID_OPENING_RATIO * width)) return null;
    sumX += axisOffset(at(e.iris), ca, cb);
    sumY += axisOffset(at(e.iris), ld, lu);
  }

  const fl = at(FACE_LEFT);
  const fr = at(FACE_RIGHT);
  const top = at(FOREHEAD);
  const chin = at(CHIN);
  const nose = at(NOSE);
  const faceW = dist(fl, fr);
  const faceH = dist(top, chin);
  if (!(faceW > EPS) || !(faceH > EPS)) return null;

  const f: GazeFeatures = {
    irisX: sumX / EYES.length,
    irisY: sumY / EYES.length,
    yaw: (nose.x - (fl.x + fr.x) / 2) / faceW,
    pitch: (nose.y - (top.y + chin.y) / 2) / faceH,
  };
  return Number.isFinite(f.irisX + f.irisY + f.yaw + f.pitch) ? f : null;
}

export interface CalibSample {
  targetXDeg: number;
  targetYDeg: number;
  features: GazeFeatures;
}

/** gazeX = ax[0]·irisX + ax[1]·yaw + ax[2]; gazeY = ay[0]·irisY + ay[1]·pitch + ay[2]. */
export interface GazeModel {
  ax: [number, number, number];
  ay: [number, number, number];
}

export interface CalibResult {
  model: GazeModel | null;
  residualDeg: number;
  usable: boolean;
}

export const CALIB_MAX_RESIDUAL_DEG = 5;

/** Eine Kalibrierung braucht alle 5 Zielpunkte aus `calibrationPoints`. */
const CALIB_TARGET_COUNT = 5;

/** Mindestzahl Proben je Zielpunkt nach dem Ausreißerfilter (das knappste Merkmal zählt). */
export const CALIB_MIN_SAMPLES_PER_POINT = 10;

/**
 * Mindest-Spannweite (max − min) der mittleren Kopfdrehung bzw. -neigung über die Zielpunkte,
 * damit der Kopfterm (b bzw. e) mitgeschätzt wird. Darunter wird die Achse mit 2 Parametern
 * gefittet (b bzw. e = 0).
 *
 * Begründung für 0,01: Die Nasenspitze liegt etwa eine halbe Gesichtsbreite vor der Ebene der
 * Gesichtsränder, yaw ändert sich also um etwa 0,5·sin(θ) ≈ 0,009 je Grad Kopfdrehung; pitch
 * (bezogen auf die größere Gesichtshöhe) etwa halb so stark. 0,01 entspricht damit etwa 1° Drehung
 * bzw. 2° Neigung. Das Zittern der Gesichtspunkte (etwa 1 px bei rund 200 px Gesichtsbreite, also
 * ≈ 0,005 je Bild) mittelt sich über die etwa 30 Bilder je Punkt auf ≈ 0,001 herunter und bleibt
 * deutlich darunter. Wer den Blick über ±15–25° mit leichter natürlicher Kopfbewegung folgt,
 * liegt deutlich darüber. Ohne diese Schranke würde b/e bei ruhigem Kopf nur Rauschen anpassen und
 * später echte Kopfbewegungen stark verstärken.
 */
export const HEAD_TERM_MIN_SPREAD = 0.01;

/** Mittel nach Ausreißerfilter: nur Werte innerhalb Median ± 3·MAD. [] → NaN, NaN im Eingang → NaN. */
export function robustMean(values: readonly number[]): number {
  const kept = robustFilter(values);
  return kept.length === 0 ? Number.NaN : kept.reduce((s, v) => s + v, 0) / kept.length;
}

/** Werte innerhalb Median ± 3·MAD; [] bei leerem Eingang oder NaN. */
function robustFilter(values: readonly number[]): number[] {
  if (values.length === 0 || values.some((v) => Number.isNaN(v))) return [];
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  return values.filter((v) => Math.abs(v - med) <= 3 * mad);
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Löst das n×n-System M·x = v (Gauß mit Spaltenpivot).
 * null, wenn die Matrix (relativ zu ihrer Größe) singulär ist.
 */
function solveLinear(m: readonly (readonly number[])[], v: readonly number[]): number[] | null {
  const n = v.length;
  const a = m.map((row, i) => [...row, v[i]!]);
  const scale = Math.max(...a.flatMap((row) => row.slice(0, n).map(Math.abs)));
  if (!(scale > 0)) return null;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    if (!(Math.abs(a[p]![c]!) > 1e-10 * scale)) return null;
    [a[c], a[p]] = [a[p]!, a[c]!];
    const pivotRow = a[c]!;
    for (let r = c + 1; r < n; r++) {
      const row = a[r]!;
      const k = row[c]! / pivotRow[c]!;
      for (let j = c; j <= n; j++) row[j] = row[j]! - k * pivotRow[j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = a[r]!;
    let s = row[n]!;
    for (let j = r + 1; j < n; j++) s -= row[j]! * x[j]!;
    x[r] = s / row[r]!;
  }
  return x;
}

/**
 * Kleinste Quadrate für target ≈ p·iris + q·head + r über die Normalgleichungen.
 * Ist die Spannweite von head kleiner als HEAD_TERM_MIN_SPREAD, wird q = 0 gesetzt (2 Parameter).
 */
function fitAxis(
  iris: readonly number[],
  head: readonly number[],
  target: readonly number[],
): [number, number, number] | null {
  const useHead = Math.max(...head) - Math.min(...head) >= HEAD_TERM_MIN_SPREAD;
  const rows = target.map((_, i) => (useHead ? [iris[i]!, head[i]!, 1] : [iris[i]!, 1]));
  const n = useHead ? 3 : 2;
  const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const v = new Array<number>(n).fill(0);
  rows.forEach((row, i) => {
    for (let j = 0; j < n; j++) {
      v[j] = v[j]! + row[j]! * target[i]!;
      for (let k = 0; k < n; k++) m[j]![k] = m[j]![k]! + row[j]! * row[k]!;
    }
  });
  const x = solveLinear(m, v);
  if (!x) return null;
  return useHead ? [x[0]!, x[1]!, x[2]!] : [x[0]!, 0, x[1]!];
}

function unusable(): CalibResult {
  return { model: null, residualDeg: Infinity, usable: false };
}

/**
 * Kleinste Quadrate je Achse über die robusten Mittel je Zielpunkt.
 * Restfehler = RMS der Abstände zwischen Zielpunkt und abgebildetem Mittel, in Grad.
 * Unbrauchbar (model null, usable false, residualDeg Infinity) bei singulärer Matrix, NaN,
 * nicht genau 5 Zielpunkten oder weniger als CALIB_MIN_SAMPLES_PER_POINT Proben je Punkt
 * nach dem Ausreißerfilter.
 */
export function fitGazeModel(samples: readonly CalibSample[]): CalibResult {
  const groups = new Map<string, CalibSample[]>();
  for (const s of samples) {
    const key = `${s.targetXDeg},${s.targetYDeg}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  if (groups.size !== CALIB_TARGET_COUNT) return unusable();

  const targets: { x: number; y: number }[] = [];
  const means: GazeFeatures[] = [];
  for (const list of groups.values()) {
    const first = list[0]!;
    const kept = {
      irisX: robustFilter(list.map((s) => s.features.irisX)),
      irisY: robustFilter(list.map((s) => s.features.irisY)),
      yaw: robustFilter(list.map((s) => s.features.yaw)),
      pitch: robustFilter(list.map((s) => s.features.pitch)),
    };
    const fewest = Math.min(kept.irisX.length, kept.irisY.length, kept.yaw.length, kept.pitch.length);
    if (fewest < CALIB_MIN_SAMPLES_PER_POINT) return unusable();
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    const f: GazeFeatures = {
      irisX: mean(kept.irisX),
      irisY: mean(kept.irisY),
      yaw: mean(kept.yaw),
      pitch: mean(kept.pitch),
    };
    if (![first.targetXDeg, first.targetYDeg, f.irisX, f.irisY, f.yaw, f.pitch].every(Number.isFinite)) {
      return unusable();
    }
    targets.push({ x: first.targetXDeg, y: first.targetYDeg });
    means.push(f);
  }

  const ax = fitAxis(
    means.map((f) => f.irisX),
    means.map((f) => f.yaw),
    targets.map((t) => t.x),
  );
  const ay = fitAxis(
    means.map((f) => f.irisY),
    means.map((f) => f.pitch),
    targets.map((t) => t.y),
  );
  if (!ax || !ay || ![...ax, ...ay].every(Number.isFinite)) return unusable();

  const model: GazeModel = { ax, ay };
  let sq = 0;
  means.forEach((f, i) => {
    const q = mapGaze(model, f);
    const t = targets[i]!;
    sq += (q.xDeg - t.x) ** 2 + (q.yDeg - t.y) ** 2;
  });
  const residualDeg = Math.sqrt(sq / means.length);
  if (!Number.isFinite(residualDeg)) return unusable();
  return { model, residualDeg, usable: residualDeg <= CALIB_MAX_RESIDUAL_DEG };
}

export function mapGaze(m: GazeModel, f: GazeFeatures): { xDeg: number; yDeg: number } {
  return {
    xDeg: m.ax[0] * f.irisX + m.ax[1] * f.yaw + m.ax[2],
    yDeg: m.ay[0] * f.irisY + m.ay[1] * f.pitch + m.ay[2],
  };
}
