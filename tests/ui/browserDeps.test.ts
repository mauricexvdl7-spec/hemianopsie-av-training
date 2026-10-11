// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createAbortSignals, soundStartSec, createBrowserDeps } from '../../src/ui/browserDeps';
import type { AudioEngine } from '../../src/io/audio';
import { DEFAULT_GEOMETRY } from '../../src/store/db';
import { samplePlan } from '../helpers/plans';

describe('createAbortSignals', () => {
  it('meldet hidden bei visibilitychange', () => {
    const s = createAbortSignals(window, document);
    const cb = vi.fn();
    const off = s.onAbort(cb);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledWith('hidden');
    off();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('meldet hidden sofort, wenn die App beim Anmelden schon im Hintergrund ist', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    const s = createAbortSignals(window, document);
    const cb = vi.fn();
    const off = s.onAbort(cb);
    expect(cb).not.toHaveBeenCalled(); // nicht synchron: der Aufrufer ist noch nicht fertig angemeldet
    await Promise.resolve();
    expect(cb).toHaveBeenCalledWith('hidden');
    off();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('meldet resize nur bei geänderter Größe', () => {
    const s = createAbortSignals(window, document);
    const cb = vi.fn();
    const off = s.onAbort(cb);
    window.dispatchEvent(new Event('resize'));
    expect(cb).not.toHaveBeenCalled();
    Object.defineProperty(window, 'innerWidth', { value: window.innerWidth + 100, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(cb).toHaveBeenCalledWith('resize');
    off();
  });

  it('nach Abmelden keine Meldung', () => {
    const s = createAbortSignals(window, document);
    const cb = vi.fn();
    s.onAbort(cb)();
    Object.defineProperty(window, 'innerWidth', { value: window.innerWidth + 50, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('soundStartSec', () => {
  it('rechnet performance-Zeit in AudioContext-Zeit um', () => {
    // Ton soll bei t0 + soa = 1500 - 200 = 1300 ms beginnen; jetzt 1000 ms; Audio-Uhr 5 s → 5,3 s
    expect(soundStartSec({ t0Ms: 1500, soaMs: -200, nowMs: 1000, audioNowSec: 5 })).toBeCloseTo(5.3);
  });
  it('nie in der Vergangenheit', () => {
    expect(soundStartSec({ t0Ms: 1000, soaMs: 0, nowMs: 1200, audioNowSec: 5 })).toBe(5);
  });
});

describe('soundStartSec mit Ausgabelatenz', () => {
  it('zieht die Latenz ab, damit Ton und Licht gleichzeitig ankommen', () => {
    expect(soundStartSec({ t0Ms: 1500, soaMs: 0, nowMs: 1000, audioNowSec: 5, latencySec: 0.1 })).toBeCloseTo(5.4);
  });
  it('nie vor der aktuellen Audiozeit', () => {
    expect(soundStartSec({ t0Ms: 1050, soaMs: 0, nowMs: 1000, audioNowSec: 5, latencySec: 0.2 })).toBe(5);
  });
});

describe('createBrowserDeps.scheduleSound', () => {
  function fakeAudio(running: boolean) {
    return {
      isRunning: () => running,
      nowSec: () => 5,
      outputLatencySec: () => 0.05,
      scheduleBurst: vi.fn(),
      cancelBursts: vi.fn(),
    };
  }
  const deps = (audio: ReturnType<typeof fakeAudio>) =>
    createBrowserDeps({
      canvas: document.createElement('canvas'),
      audio: audio as unknown as AudioEngine,
      input: { arm: () => undefined, disarm: () => undefined } as never,
      geometry: DEFAULT_GEOMETRY,
    });

  it('spielt keinen Ton, solange der Audio-Kontext nicht läuft (sonst stauen sich Töne)', () => {
    const a = fakeAudio(false);
    expect(deps(a).scheduleSound(samplePlan(), performance.now() + 100)).toBe(false);
    expect(a.scheduleBurst).not.toHaveBeenCalled();
  });

  it('cancelSound bricht die geplanten Töne der Audio-Engine ab', () => {
    const a = fakeAudio(true);
    deps(a).cancelSound();
    expect(a.cancelBursts).toHaveBeenCalledTimes(1);
  });

  it('plant den Ton bei laufendem Kontext', () => {
    const a = fakeAudio(true);
    expect(deps(a).scheduleSound(samplePlan(), performance.now() + 100)).toBe(true);
    expect(a.scheduleBurst).toHaveBeenCalledTimes(1);
  });
});
