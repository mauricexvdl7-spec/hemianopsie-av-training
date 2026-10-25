// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Point3 } from '../../src/core/gaze';
import {
  CAMERA_START_TIMEOUT_MS,
  LANDMARKER_START_TIMEOUT_MS,
  startCamera,
  type CameraDeps,
  type CameraFrame,
  type CameraSource,
} from '../../src/io/camera';

// Das echte Paket (WASM) wird in Tests nie geladen; der Standard-Landmarker bekommt diese Attrappe.
const mp = vi.hoisted(() => ({
  delegates: [] as string[],
  options: [] as unknown[],
  basePaths: [] as unknown[],
  failDelegates: new Set<string>(),
  faces: [] as unknown[],
  close: (() => undefined) as () => void,
}));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: async (basePath: string) => {
      mp.basePaths.push(basePath);
      return { wasmLoaderPath: 'x', wasmBinaryPath: 'y' };
    },
  },
  FaceLandmarker: {
    createFromOptions: async (_fileset: unknown, opts: { baseOptions: { delegate: string } }) => {
      mp.delegates.push(opts.baseOptions.delegate);
      mp.options.push(opts);
      if (mp.failDelegates.has(opts.baseOptions.delegate)) throw new Error(`${opts.baseOptions.delegate} geht nicht`);
      return { detectForVideo: () => ({ faceLandmarks: mp.faces }), close: () => mp.close() };
    },
  },
}));

/** Minimales Gesicht mit 478 Punkten, Augen offen, Nase bei (0.5, 0.55). */
function face(): Point3[] {
  const lm: Point3[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, z: 0 });
  set(33, 0.4, 0.45);
  set(133, 0.46, 0.45);
  set(159, 0.43, 0.44);
  set(145, 0.43, 0.46);
  set(468, 0.43, 0.45);
  set(362, 0.54, 0.45);
  set(263, 0.6, 0.45);
  set(386, 0.57, 0.44);
  set(374, 0.57, 0.46);
  set(473, 0.57, 0.45);
  set(1, 0.5, 0.55);
  set(234, 0.35, 0.5);
  set(454, 0.65, 0.5);
  set(10, 0.5, 0.3);
  set(152, 0.5, 0.8);
  return lm;
}

/** Lässt anstehende Versprechen (Promise-Ketten) abarbeiten. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function fakeStream() {
  const track = { stop: vi.fn() };
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

/** Steuerbare Bildtakt-Attrappe: `step()` führt die angemeldeten Rückrufe aus. */
function fakeFrames() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    frame: vi.fn((cb: () => void) => {
      const id = next++;
      pending.set(id, cb);
      return id;
    }),
    cancelFrame: vi.fn((id: number) => void pending.delete(id)),
    step() {
      const cbs = [...pending.values()];
      pending.clear();
      cbs.forEach((cb) => cb());
    },
    pendingCount: () => pending.size,
  };
}

function deps(over: Partial<CameraDeps> = {}) {
  const { stream, track } = fakeStream();
  const frames = fakeFrames();
  let t = 1000;
  const landmarker = { detect: vi.fn((): Point3[][] => [face()]), close: vi.fn() };
  const d = {
    getUserMedia: vi.fn(async () => stream),
    createLandmarker: vi.fn(async () => landmarker),
    now: () => t,
    frame: frames.frame,
    cancelFrame: frames.cancelFrame,
    ...over,
  } satisfies Partial<CameraDeps>;
  return {
    d,
    track,
    frames,
    landmarker,
    setNow: (v: number) => (t = v),
  };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  mp.delegates.length = 0;
  mp.options.length = 0;
  mp.basePaths.length = 0;
  mp.failDelegates.clear();
  mp.faces = [face()];
  mp.close = () => undefined;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startCamera', () => {
  it('fragt die Frontkamera mit 1280×720 und 30 fps an (Webcam am PC, 70 cm Abstand)', async () => {
    const getUserMedia = vi.fn(async (_c: MediaStreamConstraints) => fakeStream().stream);
    const src = await startCamera(deps({ getUserMedia }).d);
    expect(src).not.toBeNull();
    const c = getUserMedia.mock.calls[0]![0];
    const video = c.video as MediaTrackConstraints;
    expect(c.audio).toBe(false);
    expect(video.facingMode).toBe('user');
    expect(video.width).toEqual({ ideal: 1280 });
    expect(video.height).toEqual({ ideal: 720 });
    expect(video.frameRate).toEqual({ ideal: 30 });
    src!.stop();
  });

  it('liefert je neuem Videobild Merkmale und Nasenposition; stop() beendet Spuren und Landmarker', async () => {
    const h = deps();
    const src = (await startCamera(h.d))!;
    const frames: CameraFrame[] = [];
    src.subscribe((f) => frames.push(f));
    const video = src.video();
    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect(video.srcObject).not.toBeNull();

    video.currentTime = 0.033;
    h.setNow(1033);
    h.frames.step();
    expect(frames).toHaveLength(1);
    expect(frames[0]!.tMs).toBe(1033);
    expect(frames[0]!.features).not.toBeNull();
    expect(frames[0]!.facePx).toEqual({ x: 0.5, y: 0.55 });
    expect(h.landmarker.detect).toHaveBeenCalledWith(video, 1033);

    // Gleiches Videobild → keine erneute Auswertung.
    h.frames.step();
    expect(frames).toHaveLength(1);
    expect(h.landmarker.detect).toHaveBeenCalledTimes(1);

    src.stop();
    expect(h.track.stop).toHaveBeenCalled();
    expect(h.landmarker.close).toHaveBeenCalledTimes(1);
    expect(h.frames.pendingCount()).toBe(0);
    expect(video.srcObject).toBeNull();
    video.currentTime = 0.066;
    h.frames.step();
    expect(frames).toHaveLength(1);
    // Mehrfacher Stopp ist harmlos.
    src.stop();
    expect(h.landmarker.close).toHaveBeenCalledTimes(1);
  });

  it('Abmelden beendet die Zustellung; fps zählt die Bilder der letzten Sekunde', async () => {
    const h = deps();
    const src = (await startCamera(h.d))!;
    const a: CameraFrame[] = [];
    const b: CameraFrame[] = [];
    const offA = src.subscribe((f) => a.push(f));
    src.subscribe((f) => b.push(f));
    expect(src.fps()).toBe(0);
    for (let i = 1; i <= 60; i++) {
      src.video().currentTime = i / 30;
      h.setNow(1000 + (i * 1000) / 30);
      h.frames.step();
      if (i === 10) offA();
    }
    expect(a).toHaveLength(10);
    expect(b).toHaveLength(60);
    expect(src.fps()).toBeGreaterThanOrEqual(29);
    expect(src.fps()).toBeLessThanOrEqual(31);
    src.stop();
  });

  it('Bild ohne Gesicht → features null, facePx null', async () => {
    const h = deps();
    h.landmarker.detect.mockReturnValue([]);
    const src = (await startCamera(h.d))!;
    const frames: CameraFrame[] = [];
    src.subscribe((f) => frames.push(f));
    src.video().currentTime = 0.033;
    h.frames.step();
    expect(frames).toEqual([{ tMs: 1000, features: null, facePx: null }]);
    src.stop();
  });

  it('Fehler des Landmarkers in einem Bild → Bild ohne Gesicht, Strom läuft weiter', async () => {
    const h = deps();
    h.landmarker.detect.mockImplementationOnce(() => {
      throw new Error('kaputt');
    });
    const src = (await startCamera(h.d))!;
    const frames: CameraFrame[] = [];
    src.subscribe((f) => frames.push(f));
    src.video().currentTime = 0.033;
    h.frames.step();
    src.video().currentTime = 0.066;
    h.frames.step();
    expect(frames.map((f) => f.features === null)).toEqual([true, false]);
    src.stop();
  });

  it('ein werfender Abonnent hält die anderen nicht auf', async () => {
    const h = deps();
    const src = (await startCamera(h.d))!;
    const got: CameraFrame[] = [];
    src.subscribe(() => {
      throw new Error('Abonnent kaputt');
    });
    src.subscribe((f) => got.push(f));
    for (let i = 1; i <= 3; i++) {
      src.video().currentTime = i / 30;
      h.frames.step();
    }
    expect(got).toHaveLength(3);
    expect(h.frames.pendingCount()).toBe(1);
    src.stop();
  });

  it('verweigerter Zugriff (NotAllowedError) → null, der parallel erzeugte Landmarker wird geschlossen', async () => {
    const h = deps({
      getUserMedia: vi.fn(async () => {
        throw new DOMException('verweigert', 'NotAllowedError');
      }),
    });
    expect(await startCamera(h.d)).toBeNull();
    await flush();
    expect(h.landmarker.close).toHaveBeenCalledTimes(1);
  });

  it('Landmarker lässt sich nicht erzeugen → null, Kamera wird freigegeben', async () => {
    const h = deps({
      createLandmarker: vi.fn(async () => {
        throw new Error('kein Modell');
      }),
    });
    expect(await startCamera(h.d)).toBeNull();
    await flush();
    expect(h.track.stop).toHaveBeenCalled();
  });

  it('Landmarker wird parallel zur Rückfrage erzeugt: Zugriff nach 7 s, Landmarker nach 10 s → Start gelingt', async () => {
    vi.useFakeTimers();
    const h = deps();
    let resolveStream: (s: MediaStream) => void = () => undefined;
    let resolveLm: (l: typeof h.landmarker) => void = () => undefined;
    const createLandmarker = vi.fn(() => new Promise<typeof h.landmarker>((r) => (resolveLm = r)));
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((r) => (resolveStream = r)));
    let result: unknown = 'offen';
    void startCamera({ ...h.d, getUserMedia, createLandmarker }).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(0);
    expect(createLandmarker).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(7000);
    const { stream, track } = fakeStream();
    resolveStream(stream);
    await vi.advanceTimersByTimeAsync(3000);
    expect(result).toBe('offen');
    resolveLm(h.landmarker);
    await vi.advanceTimersByTimeAsync(0);
    expect(result).not.toBeNull();
    expect(result).not.toBe('offen');

    // Keine Frist schlägt später noch zu.
    await vi.advanceTimersByTimeAsync(LANDMARKER_START_TIMEOUT_MS);
    expect(track.stop).not.toHaveBeenCalled();
    expect(h.landmarker.close).not.toHaveBeenCalled();
    (result as CameraSource).stop();
    expect(track.stop).toHaveBeenCalled();
  });

  it('unbeantwortete Rückfrage: nach CAMERA_START_TIMEOUT_MS null, paralleler Landmarker geschlossen, später Strom sofort beendet', async () => {
    vi.useFakeTimers();
    let resolveLate: (s: MediaStream) => void = () => undefined;
    const late = fakeStream();
    const h = deps({ getUserMedia: vi.fn(() => new Promise<MediaStream>((r) => (resolveLate = r))) });
    let result: unknown = 'offen';
    void startCamera(h.d).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(CAMERA_START_TIMEOUT_MS - 1);
    expect(result).toBe('offen');
    expect(h.landmarker.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBeNull();
    expect(h.landmarker.close).toHaveBeenCalledTimes(1);

    resolveLate(late.stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.track.stop).toHaveBeenCalled();
    expect(h.frames.frame).not.toHaveBeenCalled();
  });

  it('Landmarker wird nie fertig: nach LANDMARKER_START_TIMEOUT_MS null, Kamera freigegeben, später Landmarker geschlossen', async () => {
    vi.useFakeTimers();
    const lateLm = { detect: vi.fn(() => []), close: vi.fn() };
    let resolveLm: (l: typeof lateLm) => void = () => undefined;
    const h = deps({ createLandmarker: vi.fn(() => new Promise<typeof lateLm>((r) => (resolveLm = r))) });
    let result: unknown = 'offen';
    void startCamera(h.d).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(LANDMARKER_START_TIMEOUT_MS - 1);
    expect(result).toBe('offen');
    expect(h.track.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBeNull();
    expect(h.track.stop).toHaveBeenCalled();

    resolveLm(lateLm);
    await vi.advanceTimersByTimeAsync(0);
    expect(lateLm.close).toHaveBeenCalled();
    expect(h.frames.frame).not.toHaveBeenCalled();
  });

  it('Standard-Landmarker: GPU scheitert, CPU klappt → Start gelingt', async () => {
    mp.failDelegates.add('GPU');
    const closed = vi.fn();
    mp.close = closed;
    const h = deps();
    const { createLandmarker: _omit, ...rest } = h.d;
    const src = await startCamera(rest);
    expect(src).not.toBeNull();
    expect(mp.delegates).toEqual(['GPU', 'CPU']);
    expect(mp.basePaths).toEqual(['/mediapipe/wasm']);
    expect(mp.options[1]).toEqual({
      baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    });

    const frames: CameraFrame[] = [];
    src!.subscribe((f) => frames.push(f));
    src!.video().currentTime = 0.033;
    h.frames.step();
    expect(frames[0]!.features).not.toBeNull();
    src!.stop();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('Standard-Landmarker: GPU klappt → kein CPU-Versuch', async () => {
    const h = deps();
    const { createLandmarker: _omit, ...rest } = h.d;
    const src = await startCamera(rest);
    expect(src).not.toBeNull();
    expect(mp.delegates).toEqual(['GPU']);
    src!.stop();
  });

  it('Standard-Landmarker: GPU und CPU scheitern → null', async () => {
    mp.failDelegates.add('GPU');
    mp.failDelegates.add('CPU');
    const h = deps();
    const { createLandmarker: _omit, ...rest } = h.d;
    expect(await startCamera(rest)).toBeNull();
    expect(h.track.stop).toHaveBeenCalled();
  });
});
