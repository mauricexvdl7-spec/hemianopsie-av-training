// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { calibrationDurationMs, calibrationFrame, calibrationPoints } from '../../src/core/calibration';
import type { CalibResult, GazeFeatures } from '../../src/core/gaze';
import type { AudioEngine } from '../../src/io/audio';
import type { CameraFrame, CameraSource } from '../../src/io/camera';
import { DEFAULT_GEOMETRY } from '../../src/store/db';
import { currentGeometry } from '../../src/ui/browserDeps';
import { CalibrationStage } from '../../src/ui/CalibrationStage';

/** Bildtakt der Fake-Kamera. */
const FRAME_MS = 1000 / 30;

let clock = 0;
let rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  clock = 1000;
  rafQueue = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => rafQueue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  // jsdom hat kein Canvas: ein stummer 2D-Kontext genügt.
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? undefined : () => undefined), set: () => true });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Bekannte Abbildung: Iris folgt dem Blick linear, Kopf ruhig; leichte, feste Schwankung je Bild. */
function featuresFor(xDeg: number, yDeg: number, i: number): GazeFeatures {
  const jitter = 0.002 * ((i % 3) - 1);
  return { irisX: xDeg / 20 + jitter, irisY: yDeg / 15 - jitter, yaw: 0.01, pitch: -0.02 };
}

function fakeCamera(features: (tMs: number, i: number) => GazeFeatures | null) {
  const subs = new Set<(f: CameraFrame) => void>();
  const video = document.createElement('video');
  let i = 0;
  const cam: CameraSource = {
    subscribe(cb) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    video: () => video,
    fps: () => 30,
    stop: vi.fn(),
  };
  const emit = () => {
    const f = features(clock, i++);
    for (const cb of [...subs]) cb({ tMs: clock, features: f, facePx: f ? { x: 0.5, y: 0.5 } : null });
  };
  return { cam, video, emit, subscribers: () => subs.size };
}

function fakeAudio() {
  return { scheduleBurst: vi.fn(), nowSec: () => 7, isRunning: () => true, ensureRunning: () => Promise.resolve() };
}

/** Lässt Uhr, Kamera und Animationsbilder bis zum Ende der Kalibrierung (plus Reserve) laufen. */
async function runThrough(emit: () => void) {
  const end = clock + calibrationDurationMs(calibrationPoints(currentGeometry(DEFAULT_GEOMETRY))) + 500;
  await act(async () => {
    while (clock < end) {
      clock += FRAME_MS;
      emit();
      const q = rafQueue;
      rafQueue = [];
      for (const cb of q) cb(clock);
    }
  });
}

/** withFace false: die Kamera liefert nur Bilder ohne Merkmale. */
async function mount(withFace: boolean) {
  const start = clock;
  const points = calibrationPoints(currentGeometry(DEFAULT_GEOMETRY));
  // Die Fake-Kamera sieht ihn genau auf den Punkt schauen, wo er gerade ist (auch beim Gleiten).
  const camera = fakeCamera((t, i) => {
    const f = calibrationFrame(points, t - start);
    return withFace ? featuresFor(f.xDeg, f.yDeg, i) : null;
  });
  const audio = fakeAudio();
  const onDone = vi.fn<(r: CalibResult) => void>();
  const root = document.createElement('div');
  document.body.appendChild(root);
  await act(async () => {
    render(
      <CalibrationStage geometry={DEFAULT_GEOMETRY} audio={audio as unknown as AudioEngine} camera={camera.cam} now={() => clock} onDone={onDone} />,
      root,
    );
  });
  return {
    ...camera,
    audio,
    onDone,
    root,
    points,
    unmount: async () => {
      await act(async () => render(null, root));
      root.remove();
    },
  };
}

describe('CalibrationStage', () => {
  it('kalibriert mit passenden Merkmalen brauchbar und ruft onDone genau einmal', async () => {
    const m = await mount(true);
    await runThrough(m.emit);
    expect(m.onDone).toHaveBeenCalledTimes(1);
    const r = m.onDone.mock.calls[0]![0];
    expect(r.usable).toBe(true);
    expect(r.residualDeg).toBeLessThan(0.5);
    expect(m.subscribers()).toBe(0);
    await m.unmount();
  });

  it('spielt am Halt jedes Eckpunkts einen Ton aus dessen Richtung, nicht am Kreuz', async () => {
    const m = await mount(true);
    await runThrough(m.emit);
    const calls = m.audio.scheduleBurst.mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(4);
    expect(m.points.slice(1).map((p) => p.xDeg < 0)).toEqual([true, true, false, false]);
    expect(calls.map((c) => c.pos.side)).toEqual(['L', 'L', 'R', 'R']);
    for (const c of calls) {
      expect(c).toMatchObject({ gainDb: -6, rampMs: 150, plateauMs: 200, atSec: 7.05 });
    }
    await m.unmount();
  });

  it('verwirft Bilder ohne Merkmale: nur null → unbrauchbar', async () => {
    const m = await mount(false);
    await runThrough(m.emit);
    expect(m.onDone).toHaveBeenCalledTimes(1);
    expect(m.onDone.mock.calls[0]![0].usable).toBe(false);
    await m.unmount();
  });

  it('hängt das Video unsichtbar ein, solange sie läuft, und nimmt es beim Verlassen wieder heraus', async () => {
    const m = await mount(true);
    expect(m.video.parentNode).toBe(document.body);
    expect(m.video.style.opacity).toBe('0');
    expect(m.video.style.position).toBe('fixed');
    await m.unmount();
    expect(m.video.parentNode).toBeNull();
    expect(m.subscribers()).toBe(0);
  });
});
