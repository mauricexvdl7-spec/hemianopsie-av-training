/**
 * Nur das Fixationskreuz, an derselben Stelle und in derselben Größe wie im Training.
 * Steht während Begrüßung und Anleitung („Schau auf das Kreuz …“), damit er nie vor einem leeren grauen Bildschirm sitzt.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { GeometryInput } from '../../core/geometry';
import { currentGeometry } from '../browserDeps';
import { createCanvasDraw } from '../StimulusCanvas';

export function FixationScreen(props: { geometry: GeometryInput }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = createCanvasDraw(canvas, () => currentGeometry(props.geometry));
    const paint = () => {
      try {
        draw({ fixation: true, blob: null });
      } catch {
        // ohne Canvas (sehr alte Browser) bleibt der graue Hintergrund
      }
    };
    paint();
    window.addEventListener('resize', paint);
    return () => window.removeEventListener('resize', paint);
  }, []);
  return (
    <div class="stage">
      <canvas ref={canvasRef} />
    </div>
  );
}
