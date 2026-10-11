/** Vollbild-Canvas, auf dem Durchgänge laufen. Ruft run() einmal mit fertigen Runner-Abhängigkeiten auf. */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GeometryInput } from '../core/geometry';
import type { AudioEngine } from '../io/audio';
import { ResponseInput } from '../io/input';
import { createBrowserDeps } from './browserDeps';
import type { RunnerDeps } from './runner';

export function TrialStage(props: { geometry: GeometryInput; audio: AudioEngine; run(deps: RunnerDeps): Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const input = new ResponseInput(window);
    const deps = createBrowserDeps({ canvas: canvasRef.current!, audio: props.audio, input, geometry: props.geometry });
    // Fehler (z. B. verlorene Datenbankverbindung) dürfen ihn nicht am Kreuz festhalten
    props.run(deps).catch((e: unknown) => {
      input.dispose();
      setError(e instanceof Error ? e.message : String(e));
    });
    return () => input.dispose();
  }, []);
  if (error) {
    return (
      <div class="patient screen overlay-message">
        <div class="patient-right">
          <div class="message-card card">
            <p class="message-text">
              Es ist ein Fehler aufgetreten.
              <br />
              Bitte die App schließen und neu öffnen.
            </p>
            <p class="message-detail">{error}</p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="stage">
      <canvas ref={canvasRef} />
    </div>
  );
}
