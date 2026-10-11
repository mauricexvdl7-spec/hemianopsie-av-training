import { vi } from 'vitest';
import { makeGeometry } from '../../src/core/geometry';
import type { ResponseEvent } from '../../src/io/input';
import type { DrawState, RunnerDeps } from '../../src/ui/runner';

/** Fake-Umgebung für runTrial: Uhr, Frame-Takt, Eingabe und Abbruchsignal von Hand steuerbar. */
export function fakeDeps() {
  let now = 0;
  let frames: Array<(t: number) => void> = [];
  let armed: ((e: ResponseEvent) => void) | null = null;
  let abortCb: ((r: 'hidden' | 'resize') => void) | null = null;
  const draws: Array<{ t: number; state: DrawState }> = [];
  const geometry = makeGeometry(
    { screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 },
    1200,
    800,
  );
  const deps: RunnerDeps = {
    now: () => now,
    frame: (cb) => {
      frames.push(cb);
    },
    draw: (state) => {
      draws.push({ t: now, state });
    },
    scheduleSound: vi.fn(),
    cancelSound: vi.fn(),
    input: {
      arm: (cb) => {
        armed = cb;
      },
      disarm: () => {
        armed = null;
      },
    },
    geometry: () => geometry,
    signals: {
      onAbort: (cb) => {
        abortCb = cb;
        return () => {
          abortCb = null;
        };
      },
    },
  };
  return {
    deps,
    draws,
    /** Uhr in 5-ms-Schritten bis zur Zeit t vorrücken, dabei Frames ausführen. */
    advanceTo(t: number) {
      while (now < t) {
        now = Math.min(t, now + 5);
        const fs = frames;
        frames = [];
        for (const f of fs) f(now);
      }
    },
    /** Uhr ohne Zwischenframes auf t springen (Bildschirm eingefroren), dann einen Frame ausführen. */
    jumpTo(t: number) {
      now = t;
      const fs = frames;
      frames = [];
      for (const f of fs) f(now);
    },
    respondAt(t: number) {
      this.advanceTo(t);
      armed?.({ timeMs: t, source: 'pointer' });
    },
    abort(reason: 'hidden' | 'resize') {
      abortCb?.(reason);
    },
    get now() {
      return now;
    },
  };
}
