import { describe, it, expect } from 'vitest';
import { makeGeometry } from '../../src/core/geometry';
import { createRng, type Rng } from '../../src/core/rng';
import { calibrationPoints } from '../../src/core/calibration';
import {
  featuresFromLandmarks,
  fitGazeModel,
  mapGaze,
  robustMean,
  CALIB_MAX_RESIDUAL_DEG,
  CALIB_MIN_SAMPLES_PER_POINT,
  HEAD_TERM_MIN_SPREAD,
  type Point3,
  type CalibSample,
  type GazeFeatures,
  type GazeModel,
} from '../../src/core/gaze';

// ---------- Synthetisches Gesicht ----------

interface FaceOpts {
  /** Iris-Verschiebung in x als Anteil der Augenbreite, je Auge (A: 33/133, B: 362/263). */
  shiftA?: number;
  shiftB?: number;
  /** Iris-Verschiebung in Bild-y (nach unten positiv), absolut. */
  irisDy?: number;
  noseX?: number;
  noseY?: number;
  count?: number;
}

const EYE_W = 0.06;

function face(o: FaceOpts = {}): Point3[] {
  const lm: Point3[] = Array.from({ length: o.count ?? 478 }, () => ({ x: 0, y: 0, z: 0 }));
  const set = (i: number, x: number, y: number) => {
    if (i < lm.length) lm[i] = { x, y, z: 0 };
  };
  // Auge A
  set(33, 0.4, 0.45);
  set(133, 0.46, 0.45);
  set(159, 0.43, 0.44);
  set(145, 0.43, 0.46);
  set(468, 0.43 + (o.shiftA ?? 0) * EYE_W, 0.45 + (o.irisDy ?? 0));
  // Auge B
  set(362, 0.54, 0.45);
  set(263, 0.6, 0.45);
  set(386, 0.57, 0.44);
  set(374, 0.57, 0.46);
  set(473, 0.57 + (o.shiftB ?? 0) * EYE_W, 0.45 + (o.irisDy ?? 0));
  // Kopf
  set(1, o.noseX ?? 0.5, o.noseY ?? 0.55);
  set(234, 0.35, 0.5);
  set(454, 0.65, 0.5);
  set(10, 0.5, 0.3);
  set(152, 0.5, 0.8);
  return lm;
}

describe('featuresFromLandmarks', () => {
  it('Iris mittig → irisX ≈ 0, irisY ≈ 0; Kopf gerade → yaw ≈ 0, pitch ≈ 0', () => {
    const f = featuresFromLandmarks(face())!;
    expect(f).not.toBeNull();
    expect(f.irisX).toBeCloseTo(0);
    expect(f.irisY).toBeCloseTo(0);
    expect(f.yaw).toBeCloseTo(0);
    expect(f.pitch).toBeCloseTo(0);
  });

  it('Iris um 30 % der Augenbreite Richtung Augenwinkel 33 → irisX negativ, beide Augen gleichsinnig', () => {
    const both = featuresFromLandmarks(face({ shiftA: -0.3, shiftB: -0.3 }))!;
    expect(both.irisX).toBeCloseTo(-0.6);
    const onlyA = featuresFromLandmarks(face({ shiftA: -0.3 }))!;
    const onlyB = featuresFromLandmarks(face({ shiftB: -0.3 }))!;
    expect(onlyA.irisX).toBeCloseTo(-0.3);
    expect(onlyB.irisX).toBeCloseTo(-0.3);
    const other = featuresFromLandmarks(face({ shiftA: 0.3, shiftB: 0.3 }))!;
    expect(other.irisX).toBeCloseTo(0.6);
  });

  it('Iris Richtung Oberlid → irisY positiv (halbe Lidspalte = 1)', () => {
    const f = featuresFromLandmarks(face({ irisDy: -0.005 }))!;
    expect(f.irisY).toBeCloseTo(0.5);
  });

  it('yaw und pitch aus Nase relativ zur Gesichtsmitte', () => {
    const f = featuresFromLandmarks(face({ noseX: 0.53, noseY: 0.6 }))!;
    expect(f.yaw).toBeCloseTo(0.1);
    expect(f.pitch).toBeCloseTo(0.1);
  });

  it('477 Punkte → null', () => {
    expect(featuresFromLandmarks(face({ count: 477 }))).toBeNull();
  });

  it('entartetes Auge (Augenwinkel aufeinander) → null', () => {
    const lm = face();
    lm[133] = { ...lm[33]! };
    expect(featuresFromLandmarks(lm)).toBeNull();
  });

  it('geschlossenes Auge (Lider aufeinander) → null', () => {
    const lm = face();
    lm[386] = { x: 0.57, y: 0.45, z: 0 };
    lm[374] = { x: 0.57, y: 0.45, z: 0 };
    expect(featuresFromLandmarks(lm)).toBeNull();
  });
});

// ---------- robustMean ----------

describe('robustMean', () => {
  it('filtert Ausreißer', () => {
    expect(robustMean([1, 1, 1, 1, 100])).toBe(1);
  });

  it('[] → NaN', () => {
    expect(robustMean([])).toBeNaN();
  });

  it('ohne Ausreißer = Mittelwert', () => {
    expect(robustMean([1, 2, 3, 4])).toBeCloseTo(2.5);
  });

  it('NaN in den Werten → NaN', () => {
    expect(robustMean([1, Number.NaN, 2])).toBeNaN();
  });
});

// ---------- Kalibrierfit ----------

const g = makeGeometry(
  { screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 },
  1180,
  820,
);
const points = calibrationPoints(g);
const TRUE: GazeModel = { ax: [40, 15, -2], ay: [35, 12, 1] };

/** Kopfhaltung je Punkt (center, leftUp, leftDown, rightUp, rightDown), unabhängig von den Zielen. */
const YAW = [0, 0.15, -0.15, 0.15, -0.15];
const PITCH = [0, 0.15, 0.15, -0.15, -0.15];

function gauss(rng: Rng): number {
  const u = 1 - rng.next();
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Merkmale, die unter TRUE genau auf das Ziel abbilden. */
function exactFeatures(i: number): GazeFeatures {
  const p = points[i]!;
  const yaw = YAW[i]!;
  const pitch = PITCH[i]!;
  return {
    irisX: (p.xDeg - TRUE.ax[2] - TRUE.ax[1] * yaw) / TRUE.ax[0],
    irisY: (p.yDeg - TRUE.ay[2] - TRUE.ay[1] * pitch) / TRUE.ay[0],
    yaw,
    pitch,
  };
}

function synthSamples(sigma: number, seed: number, perPoint = 30): CalibSample[] {
  const rng = createRng(seed);
  const out: CalibSample[] = [];
  points.forEach((p, i) => {
    const f = exactFeatures(i);
    for (let k = 0; k < perPoint; k++) {
      out.push({
        targetXDeg: p.xDeg,
        targetYDeg: p.yDeg,
        features: { ...f, irisX: f.irisX + sigma * gauss(rng), irisY: f.irisY + sigma * gauss(rng) },
      });
    }
  });
  return out;
}

describe('fitGazeModel', () => {
  it('Grenze 5°', () => {
    expect(CALIB_MAX_RESIDUAL_DEG).toBe(5);
  });

  it('gewinnt die bekannte Abbildung bei kleinem Rauschen zurück', () => {
    const r = fitGazeModel(synthSamples(0.005, 1234));
    expect(r.usable).toBe(true);
    expect(r.residualDeg).toBeLessThan(0.5);
    const m = r.model!;
    expect(m).not.toBeNull();
    // 1 % der Parametergröße je Achse
    const tolX = 0.01 * Math.hypot(...TRUE.ax);
    const tolY = 0.01 * Math.hypot(...TRUE.ay);
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(m.ax[k]! - TRUE.ax[k]!)).toBeLessThan(tolX);
      expect(Math.abs(m.ay[k]! - TRUE.ay[k]!)).toBeLessThan(tolY);
    }
    // Abbildung an jedem Zielpunkt auf 0,5° genau
    points.forEach((p, i) => {
      const q = mapGaze(m, exactFeatures(i));
      expect(Math.hypot(q.xDeg - p.xDeg, q.yDeg - p.yDeg)).toBeLessThan(0.5);
    });
  });

  it('ohne Rauschen exakt', () => {
    const r = fitGazeModel(synthSamples(0, 1));
    expect(r.residualDeg).toBeCloseTo(0, 6);
    for (let k = 0; k < 3; k++) {
      expect(r.model!.ax[k]).toBeCloseTo(TRUE.ax[k]!, 6);
      expect(r.model!.ay[k]).toBeCloseTo(TRUE.ay[k]!, 6);
    }
  });

  it('Restfehler wächst mit dem Rauschen', () => {
    const r1 = fitGazeModel(synthSamples(0.005, 7)).residualDeg;
    const r2 = fitGazeModel(synthSamples(0.03, 7)).residualDeg;
    const r3 = fitGazeModel(synthSamples(0.1, 7)).residualDeg;
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeGreaterThan(r2);
  });

  it('Rauschen σ 0,1 je Probe wird über 30 Proben weggemittelt: Restfehler wächst, bleibt aber unter 5°', () => {
    const r = fitGazeModel(synthSamples(0.1, 99));
    expect(r.residualDeg).toBeGreaterThan(fitGazeModel(synthSamples(0.005, 99)).residualDeg);
    expect(r.residualDeg).toBeLessThan(CALIB_MAX_RESIDUAL_DEG);
  });

  it('systematischer Fehler je Zielpunkt (σ 0,5, nicht wegzumitteln) → Restfehler über 5°, unbrauchbar', () => {
    const rng = createRng(99);
    const bias = points.map(() => ({ x: 0.5 * gauss(rng), y: 0.5 * gauss(rng) }));
    const samples = synthSamples(0.005, 99).map((s) => {
      const i = points.findIndex((p) => p.xDeg === s.targetXDeg && p.yDeg === s.targetYDeg);
      const b = bias[i]!;
      return { ...s, features: { ...s.features, irisX: s.features.irisX + b.x, irisY: s.features.irisY + b.y } };
    });
    const r = fitGazeModel(samples);
    expect(r.residualDeg).toBeGreaterThan(5);
    expect(r.usable).toBe(false);
    expect(r.model).not.toBeNull();
  });

  it('konstante Merkmale an allen Punkten (er folgt nicht) → unbrauchbar, kein Wurf', () => {
    const f: GazeFeatures = { irisX: 0.1, irisY: -0.05, yaw: 0.02, pitch: 0.01 };
    const samples: CalibSample[] = points.flatMap((p) =>
      Array.from({ length: 30 }, () => ({ targetXDeg: p.xDeg, targetYDeg: p.yDeg, features: { ...f } })),
    );
    let r: ReturnType<typeof fitGazeModel> | undefined;
    expect(() => {
      r = fitGazeModel(samples);
    }).not.toThrow();
    expect(r!.usable).toBe(false);
    expect(r!.model).toBeNull();
    expect(r!.residualDeg).toBe(Infinity);
  });

  it('NaN in den Merkmalen → unbrauchbar', () => {
    const samples = synthSamples(0.005, 3);
    samples[10] = { ...samples[10]!, features: { ...samples[10]!.features, irisX: Number.NaN } };
    const r = fitGazeModel(samples);
    expect(r.usable).toBe(false);
    expect(r.model).toBeNull();
    expect(r.residualDeg).toBe(Infinity);
  });

  it('weniger als 3 Zielpunkte → unbrauchbar', () => {
    const keep = [points[0]!, points[3]!];
    const samples = synthSamples(0.005, 3).filter((s) =>
      keep.some((p) => p.xDeg === s.targetXDeg && p.yDeg === s.targetYDeg),
    );
    const r = fitGazeModel(samples);
    expect(r.usable).toBe(false);
    expect(r.model).toBeNull();
    expect(r.residualDeg).toBe(Infinity);
    expect(fitGazeModel([]).usable).toBe(false);
  });

  it('nur 4 Zielpunkte → unbrauchbar (Kalibrierung unvollständig)', () => {
    const last = points[4]!;
    const samples = synthSamples(0.005, 3).filter(
      (s) => !(s.targetXDeg === last.xDeg && s.targetYDeg === last.yDeg),
    );
    const r = fitGazeModel(samples);
    expect(r.usable).toBe(false);
    expect(r.model).toBeNull();
    expect(r.residualDeg).toBe(Infinity);
  });

  it('5 Zielpunkte, aber einer mit nur 6 Proben → unbrauchbar', () => {
    expect(CALIB_MIN_SAMPLES_PER_POINT).toBe(10);
    const thin = points[2]!;
    let n = 0;
    const samples = synthSamples(0.005, 3).filter(
      (s) => !(s.targetXDeg === thin.xDeg && s.targetYDeg === thin.yDeg) || n++ < 6,
    );
    expect(samples.length).toBe(4 * 30 + 6);
    const r = fitGazeModel(samples);
    expect(r.usable).toBe(false);
    expect(r.model).toBeNull();
    expect(r.residualDeg).toBe(Infinity);
  });

  it('Ergebnis ohne Modell ist je Aufruf ein eigenes Objekt', () => {
    const a = fitGazeModel([]);
    a.usable = true;
    a.residualDeg = 0;
    const b = fitGazeModel([]);
    expect(b).not.toBe(a);
    expect(b.usable).toBe(false);
    expect(b.residualDeg).toBe(Infinity);
  });

  it('Kopf still (yaw nur Zittern σ 1e-3) → Kopfterm b = 0, Abbildung trotzdem auf 0,5° genau', () => {
    expect(HEAD_TERM_MIN_SPREAD).toBeGreaterThan(0);
    const rng = createRng(4321);
    const YAW_STILL = 0.02;
    const samples: CalibSample[] = [];
    const exact: GazeFeatures[] = [];
    points.forEach((p, i) => {
      const pitch = PITCH[i]!;
      const f: GazeFeatures = {
        irisX: (p.xDeg - TRUE.ax[2] - TRUE.ax[1] * YAW_STILL) / TRUE.ax[0],
        irisY: (p.yDeg - TRUE.ay[2] - TRUE.ay[1] * pitch) / TRUE.ay[0],
        yaw: YAW_STILL,
        pitch,
      };
      exact.push(f);
      for (let k = 0; k < 30; k++) {
        samples.push({
          targetXDeg: p.xDeg,
          targetYDeg: p.yDeg,
          features: {
            irisX: f.irisX + 0.005 * gauss(rng),
            irisY: f.irisY + 0.005 * gauss(rng),
            yaw: YAW_STILL + 1e-3 * gauss(rng),
            pitch,
          },
        });
      }
    });
    const r = fitGazeModel(samples);
    expect(r.usable).toBe(true);
    const m = r.model!;
    expect(m.ax[1]).toBe(0);
    // y-Achse unabhängig: Neigung variiert, e wird weiter geschätzt
    expect(Math.abs(m.ay[1] - TRUE.ay[1])).toBeLessThan(0.01 * Math.hypot(...TRUE.ay));
    points.forEach((p, i) => {
      const q = mapGaze(m, exact[i]!);
      expect(Math.hypot(q.xDeg - p.xDeg, q.yDeg - p.yDeg)).toBeLessThan(0.5);
    });
  });

  it('natürliche Kopfbewegung (gut konditioniert) → b und e werden geschätzt', () => {
    const m = fitGazeModel(synthSamples(0.005, 1234)).model!;
    expect(m.ax[1]).not.toBe(0);
    expect(m.ay[1]).not.toBe(0);
    expect(Math.abs(m.ax[1] - TRUE.ax[1])).toBeLessThan(0.01 * Math.hypot(...TRUE.ax));
    expect(Math.abs(m.ay[1] - TRUE.ay[1])).toBeLessThan(0.01 * Math.hypot(...TRUE.ay));
  });

  it('einzelne Ausreißer-Proben stören den Fit nicht', () => {
    const samples = synthSamples(0.005, 5);
    for (let k = 0; k < samples.length; k += 15) {
      const s = samples[k]!;
      samples[k] = { ...s, features: { ...s.features, irisX: s.features.irisX + 1 } };
    }
    const r = fitGazeModel(samples);
    expect(r.usable).toBe(true);
    expect(r.residualDeg).toBeLessThan(0.5);
  });
});

describe('mapGaze', () => {
  it('wendet beide Achsen an', () => {
    const q = mapGaze(TRUE, { irisX: 0.5, irisY: -0.2, yaw: 0.1, pitch: 0.2 });
    expect(q.xDeg).toBeCloseTo(40 * 0.5 + 15 * 0.1 - 2);
    expect(q.yDeg).toBeCloseTo(35 * -0.2 + 12 * 0.2 + 1);
  });
});
