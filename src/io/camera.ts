/**
 * Frontkamera + MediaPipe Face Landmarker als Strom von Blickmerkmalen.
 * Datenschutz: Kein Bild wird gespeichert oder übertragen; nach außen gehen nur Zahlen.
 * Das Videoelement gibt es nur für Testseite und Einrichtung (Vorschau für den Angehörigen).
 */
import { featuresFromLandmarks, type GazeFeatures, type Point3 } from '../core/gaze';

/** Länger wartet der Start nicht auf die Kamera (z. B. eine unbeantwortete Rückfrage); danach läuft das Training ohne Kamera. */
export const CAMERA_START_TIMEOUT_MS = 8000;
/** Obergrenze für den ganzen Start samt Landmarker (WASM und Modell laden, GPU, dann CPU), ab Aufruf gemessen. */
export const LANDMARKER_START_TIMEOUT_MS = 20000;

/** MediaPipe-Dateien, vom Build nach `public/mediapipe/` gelegt (kein Netz zur Laufzeit). */
const WASM_BASE_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/mediapipe/face_landmarker.task';
/** Index der Nasenspitze in den MediaPipe-Gesichtspunkten. */
const NOSE_TIP = 1;
/** Zeitfenster für die Bildrate. */
const FPS_WINDOW_MS = 1000;

export interface CameraFrame {
  tMs: number;
  features: GazeFeatures | null;
  /** Nasenspitze relativ zum Bild 0..1 (ungespiegelt); null ohne Gesicht. */
  facePx: { x: number; y: number } | null;
}

export interface CameraSource {
  /** Ruft cb je verarbeitetem Bild auf; liefert Abmeldefunktion. */
  subscribe(cb: (f: CameraFrame) => void): () => void;
  /** Für Testseite/Einrichtung: Videoelement (nie auf Patientenbildschirmen einhängen). */
  video(): HTMLVideoElement;
  /** Verarbeitete Bilder in der letzten Sekunde. */
  fps(): number;
  /** Beendet Bildtakt, Kamera und Landmarker; mehrfach aufrufbar. */
  stop(): void;
}

export interface FaceLandmarkerLike {
  /** Gesichter im Bild, je Gesicht die normierten Punkte (x, y in 0..1). */
  detect(video: HTMLVideoElement, tMs: number): readonly (readonly Point3[])[];
  close(): void;
}

export interface CameraDeps {
  getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>;
  createLandmarker(): Promise<FaceLandmarkerLike>;
  now(): number;
  frame(cb: () => void): number;
  cancelFrame(id: number): void;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
};

/**
 * Lädt MediaPipe erst bei Bedarf (Tests und Seiten ohne Kamera laden das WASM-Paket nie).
 * Versucht zuerst die GPU, bei Fehler die CPU.
 */
async function createDefaultLandmarker(): Promise<FaceLandmarkerLike> {
  const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
  const open = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
  let lm: Awaited<ReturnType<typeof open>>;
  try {
    lm = await open('GPU');
  } catch {
    lm = await open('CPU');
  }
  // MediaPipe verlangt streng steigende Zeitstempel im Videomodus.
  let lastTs = -Infinity;
  return {
    detect(video, tMs) {
      const ts = Math.max(tMs, lastTs + 1);
      lastTs = ts;
      return lm.detectForVideo(video, ts).faceLandmarks;
    },
    close: () => lm.close(),
  };
}

const defaultDeps: CameraDeps = {
  getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  createLandmarker: createDefaultLandmarker,
  now: () => performance.now(),
  frame: (cb) => requestAnimationFrame(() => cb()),
  cancelFrame: (id) => cancelAnimationFrame(id),
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
};

const stopTracks = (s: MediaStream) => s.getTracks().forEach((t) => t.stop());

/** Ignoriert Fehler beim Aufräumen: Freigeben darf den Ablauf nie aufhalten. */
function quietly(fn: () => void): void {
  try {
    fn();
  } catch {
    // bereits freigegeben oder nicht unterstützt
  }
}

/**
 * Frontkamera (facingMode 'user', 640×480, 30 fps) + Landmarker (GPU, bei Fehler CPU). Wirft nie.
 * Der Landmarker wird parallel zur Kamera-Rückfrage erzeugt.
 * null bei Verweigerung oder Fehler, wenn die Kamera nicht binnen CAMERA_START_TIMEOUT_MS freigegeben ist
 * oder wenn der Start insgesamt länger als LANDMARKER_START_TIMEOUT_MS dauert.
 */
export function startCamera(deps: Partial<CameraDeps> = {}): Promise<CameraSource | null> {
  const d: CameraDeps = { ...defaultDeps, ...deps };
  return new Promise<CameraSource | null>((resolve) => {
    let settled = false;
    const timers: unknown[] = [];
    let streamArrived = false;
    // Was nach dem Ende des Starts noch eintrifft, wird sofort wieder freigegeben.
    let stream: MediaStream | null = null;
    let landmarker: FaceLandmarkerLike | null = null;
    let video: HTMLVideoElement | null = null;
    const release = () => {
      if (stream) quietly(() => stopTracks(stream!));
      if (landmarker) quietly(() => landmarker!.close());
      if (video) quietly(() => (video!.srcObject = null));
      stream = null;
      landmarker = null;
    };
    /** Beendet den Start; false, wenn er schon beendet war. */
    const finish = (src: CameraSource | null): boolean => {
      if (settled) return false;
      settled = true;
      for (const t of timers) quietly(() => d.clearTimeout(t));
      if (!src) release();
      resolve(src);
      return true;
    };

    try {
      timers.push(
        d.setTimeout(() => {
          if (!streamArrived) finish(null);
        }, CAMERA_START_TIMEOUT_MS),
        d.setTimeout(() => finish(null), LANDMARKER_START_TIMEOUT_MS),
      );

      const landmarkerReady = new Promise<FaceLandmarkerLike>((r) => r(d.createLandmarker())).then((lm) => {
        if (settled) quietly(() => lm.close());
        else landmarker = lm;
        return lm;
      });
      const cameraReady = (async () => {
        const s = await d.getUserMedia(CONSTRAINTS);
        streamArrived = true;
        if (settled) {
          quietly(() => stopTracks(s));
          return;
        }
        stream = s;
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = s;
        await video.play();
      })();

      Promise.all([cameraReady, landmarkerReady]).then(
        () => {
          if (settled || !stream || !video || !landmarker) return;
          const src = makeSource(d, stream, video, landmarker);
          if (!finish(src)) src.stop();
        },
        () => finish(null),
      );
    } catch {
      finish(null);
    }
  });
}

function makeSource(d: CameraDeps, stream: MediaStream, video: HTMLVideoElement, landmarker: FaceLandmarkerLike): CameraSource {
  const subscribers = new Set<(f: CameraFrame) => void>();
  const frameTimes: number[] = [];
  let lastVideoTime = video.currentTime;
  let rafId: number | null = null;
  let stopped = false;

  const process = () => {
    const tMs = d.now();
    let faces: readonly (readonly Point3[])[] = [];
    try {
      faces = landmarker.detect(video, tMs);
    } catch {
      // Ein misslungenes Bild zählt als Bild ohne Gesicht.
    }
    const lm = faces[0];
    const nose = lm?.[NOSE_TIP];
    const frame: CameraFrame = {
      tMs,
      features: lm ? featuresFromLandmarks(lm) : null,
      facePx: nose ? { x: nose.x, y: nose.y } : null,
    };
    frameTimes.push(tMs);
    while (frameTimes.length > 0 && frameTimes[0]! <= tMs - FPS_WINDOW_MS) frameTimes.shift();
    for (const cb of [...subscribers]) {
      try {
        cb(frame);
      } catch {
        // Ein fehlerhafter Abnehmer darf die anderen nicht aufhalten.
      }
    }
  };

  const tick = () => {
    if (stopped) return;
    rafId = d.frame(tick);
    // Nur neue Videobilder auswerten (der Bildschirm läuft oft schneller als die Kamera).
    const vt = video.currentTime;
    if (vt === lastVideoTime) return;
    lastVideoTime = vt;
    process();
  };
  rafId = d.frame(tick);

  return {
    subscribe(cb) {
      subscribers.add(cb);
      return () => void subscribers.delete(cb);
    },
    video: () => video,
    fps() {
      const now = d.now();
      return frameTimes.filter((t) => t > now - FPS_WINDOW_MS).length;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      subscribers.clear();
      if (rafId !== null) quietly(() => d.cancelFrame(rafId!));
      rafId = null;
      quietly(() => stopTracks(stream));
      quietly(() => landmarker.close());
      quietly(() => video.pause());
      quietly(() => (video.srcObject = null));
    },
  };
}
