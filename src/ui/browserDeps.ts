/** Verbindet den Durchgangs-Runner mit Browser, Canvas, Audio und Eingabe. */
import { makeGeometry, type Geometry, type GeometryInput } from '../core/geometry';
import type { AudioEngine } from '../io/audio';
import type { ResponseInput } from '../io/input';
import { mirrorToRight } from '../io/spatial';
import type { AbortReason, RunnerDeps } from './runner';
import { createCanvasDraw } from './StimulusCanvas';

/** Abbruch bei Wechsel in den Hintergrund oder geänderter Fenstergröße (Drehen, Split View). */
export function createAbortSignals(win: Window, doc: Document): RunnerDeps['signals'] {
  return {
    onAbort(cb: (reason: AbortReason) => void): () => void {
      const w0 = win.innerWidth;
      const h0 = win.innerHeight;
      const onVis = () => {
        if (doc.visibilityState === 'hidden') cb('hidden');
      };
      const onResize = () => {
        if (win.innerWidth !== w0 || win.innerHeight !== h0) cb('resize');
      };
      let active = true;
      doc.addEventListener('visibilitychange', onVis);
      win.addEventListener('resize', onResize);
      // Schon beim Anmelden im Hintergrund (Wechsel zwischen zwei Durchgängen): gleich melden,
      // aber erst nach Abschluss der Anmeldung
      if (doc.visibilityState === 'hidden') {
        queueMicrotask(() => {
          if (active) cb('hidden');
        });
      }
      return () => {
        active = false;
        doc.removeEventListener('visibilitychange', onVis);
        win.removeEventListener('resize', onResize);
      };
    },
  };
}

/** Startzeit des Tons auf der AudioContext-Uhr, um die Ausgabelatenz vorgezogen; nie in der Vergangenheit. */
export function soundStartSec(a: { t0Ms: number; soaMs: number; nowMs: number; audioNowSec: number; latencySec?: number }): number {
  return a.audioNowSec + Math.max(0, (a.t0Ms + a.soaMs - a.nowMs) / 1000 - (a.latencySec ?? 0));
}

export function currentGeometry(input: GeometryInput): Geometry {
  return makeGeometry(input, window.innerWidth, window.innerHeight);
}

/**
 * Geometrie für die Planung (Rasterpunkte, Kartensignatur): die Fenstergröße der Einrichtung, sonst das Live-Fenster.
 * Training ist im Fenster bis ±2 % der Einrichtung erlaubt; schon wenige Pixel können ändern, welche Rasterpunkte
 * passen, und würden die Karte zurücksetzen. Gezeichnet wird weiter mit dem Live-Fenster (`currentGeometry`).
 */
export function planningGeometry(input: GeometryInput, setup: { width: number; height: number } | null): Geometry {
  return setup ? makeGeometry(input, setup.width, setup.height) : currentGeometry(input);
}

export function isLandscape(): boolean {
  return window.innerWidth >= window.innerHeight;
}

export function createBrowserDeps(args: {
  canvas: HTMLCanvasElement;
  audio: AudioEngine;
  input: ResponseInput;
  geometry: GeometryInput;
}): RunnerDeps {
  const getGeometry = () => currentGeometry(args.geometry);
  return {
    now: () => performance.now(),
    frame: (cb) => {
      requestAnimationFrame(cb);
    },
    draw: createCanvasDraw(args.canvas, getGeometry),
    scheduleSound: (plan, t0Ms) => {
      if (!plan.pos || plan.sound === 'none') return false;
      // Steht die Audio-Uhr (iOS: suspended/interrupted), würden sich Töne stauen und später gleichzeitig erklingen
      if (!args.audio.isRunning()) return false;
      const pos = plan.sound === 'wrongSide' ? mirrorToRight(plan.pos) : plan.pos;
      args.audio.scheduleBurst({
        pos,
        gainDb: plan.soundGainDb,
        atSec: soundStartSec({
          t0Ms,
          soaMs: plan.soaMs,
          nowMs: performance.now(),
          audioNowSec: args.audio.nowSec(),
          latencySec: args.audio.outputLatencySec(),
        }),
        rampMs: plan.rampMs,
        plateauMs: plan.plateauMs,
      });
      return true;
    },
    cancelSound: () => args.audio.cancelBursts(),
    input: args.input,
    geometry: getGeometry,
    signals: createAbortSignals(window, document),
  };
}
