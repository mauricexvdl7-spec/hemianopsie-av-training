/**
 * Kalibrierbühne im Vollbild wie die Trainingsbühne (Hintergrund, Kreuz): Ein hellgrauer Punkt erscheint am Kreuz und
 * gleitet nacheinander in die vier Ecken. Am Ziel jedes Eckpunkts kommt ein kurzer Ton aus dessen Richtung.
 * Die Blickmerkmale der Kamera zählen nur im Auswertefenster des Haltens; am Ende wird die Abbildung gefittet.
 */
import { useLayoutEffect, useRef } from 'preact/hooks';
import { calibrationFrame, calibrationPoints, toVisualPos } from '../core/calibration';
import { fitGazeModel, type CalibResult, type CalibSample } from '../core/gaze';
import { sigmaDegToPx, visualToPx, type GeometryInput } from '../core/geometry';
import type { AudioEngine } from '../io/audio';
import type { CameraSource } from '../io/camera';
import { currentGeometry } from './browserDeps';
import { createCanvasDraw } from './StimulusCanvas';

/** Durchmesser des Punkts in Grad. */
const DOT_DIAMETER_DEG = 0.6;
const DOT_CSS = '#e0e0e0';
/** Ton am Ziel: leiser als im Training, Hüllkurve mit Rampe ≥ 100 ms. */
const TONE = { gainDb: -6, rampMs: 150, plateauMs: 200, leadSec: 0.05 } as const;

/**
 * iOS Safari liefert für ein Video außerhalb des Dokuments womöglich keine Bilder mehr. Deshalb hängt die Bühne das
 * Video unsichtbar (1 × 1 px, durchsichtig) ins Dokument, solange sie läuft. Datenschutz: Es ist nie zu sehen.
 */
const HIDDEN_VIDEO_STYLE = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';

export function CalibrationStage(props: {
  geometry: GeometryInput;
  audio: AudioEngine;
  camera: CameraSource;
  now?: () => number;
  onDone(r: CalibResult): void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Nur der Start zählt; spätere Änderungen der Props ändern einen laufenden Ablauf nicht.
  const start = useRef(props);

  useLayoutEffect(() => {
    const { geometry, audio, camera, onDone } = start.current;
    const now = start.current.now ?? (() => performance.now());
    const points = calibrationPoints(currentGeometry(geometry));
    const t0 = now();
    const samples: CalibSample[] = [];
    const toned = new Set<number>();
    let finished = false;
    let rafId: number | null = null;

    const video = camera.video();
    const previousStyle = video.style.cssText;
    video.style.cssText = HIDDEN_VIDEO_STYLE;
    document.body.appendChild(video);
    // Herausnehmen aus dem Dokument kann das Video angehalten haben (z. B. beim Wechsel von der Vorschau).
    try {
      video.play()?.catch(() => undefined);
    } catch {
      // Wiedergabe nicht möglich: dann kommen keine Bilder, die Kalibrierung wird unbrauchbar
    }

    const unsubscribe = camera.subscribe((f) => {
      if (finished || !f.features) return;
      const frame = calibrationFrame(points, now() - t0);
      const target = points[frame.pointIndex];
      if (!frame.sampling || !target) return;
      samples.push({ targetXDeg: target.xDeg, targetYDeg: target.yDeg, features: f.features });
    });

    const canvas = canvasRef.current;
    const draw = canvas ? createCanvasDraw(canvas, () => currentGeometry(geometry)) : null;
    const paint = (xDeg: number, yDeg: number) => {
      if (!canvas || !draw) return;
      try {
        draw({ fixation: true, blob: null });
        const g = currentGeometry(geometry);
        const pos = toVisualPos(xDeg, yDeg);
        const c = visualToPx(g, pos);
        const dpr = window.devicePixelRatio || 1;
        const r = Math.max(2, sigmaDegToPx(g, pos.eccDeg, DOT_DIAMETER_DEG / 2)) * dpr;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = DOT_CSS;
        ctx.beginPath();
        ctx.arc(c.x * dpr, c.y * dpr, r, 0, 2 * Math.PI);
        ctx.fill();
      } catch {
        // ohne Canvas (sehr alte Browser) bleibt der graue Hintergrund; die Messung läuft weiter
      }
    };

    const finish = () => {
      finished = true;
      unsubscribe();
      onDone(fitGazeModel(samples));
    };

    const tick = () => {
      rafId = null;
      if (finished) return;
      const frame = calibrationFrame(points, now() - t0);
      if (frame.done) {
        finish();
        return;
      }
      const p = points[frame.pointIndex];
      if (frame.phase === 'hold' && p && p.id !== 'center' && !toned.has(frame.pointIndex)) {
        toned.add(frame.pointIndex);
        // Steht die Audio-Uhr (iOS: unterbrochen), würde der Ton sich stauen und später erklingen
        if (audio.isRunning()) {
          audio.scheduleBurst({
            pos: toVisualPos(p.xDeg, p.yDeg),
            gainDb: TONE.gainDb,
            atSec: audio.nowSec() + TONE.leadSec,
            rampMs: TONE.rampMs,
            plateauMs: TONE.plateauMs,
          });
        }
      }
      paint(frame.xDeg, frame.yDeg);
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      finished = true;
      unsubscribe();
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (video.parentNode === document.body) document.body.removeChild(video);
      video.style.cssText = previousStyle;
    };
  }, []);

  return (
    <div class="stage">
      <canvas ref={canvasRef} />
    </div>
  );
}
