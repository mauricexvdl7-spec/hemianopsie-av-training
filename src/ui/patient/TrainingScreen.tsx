/**
 * Training (Stand M2): eine Sitzung mit 60 Durchgängen unter adaptiver Steuerung (Karte, Ortswahl, Treppe, Phasen),
 * danach „Heute gefunden: X von Y“ mit Balken. Die Sitzung lebt in einem Ref und überdauert Pausen innerhalb derselben App-Sitzung.
 * Zeitgesteuerte 30-Minuten-Sitzungen mit Pausen folgen in M3.
 */
import { useRef, useState } from 'preact/hooks';
import { createRng } from '../../core/rng';
import { DEFAULT_WINDOW_MS } from '../../core/trial';
import type { AudioEngine } from '../../io/audio';
import type { Db, Settings } from '../../store/db';
import { currentGeometry } from '../browserDeps';
import { blockSummary } from '../routing';
import { SESSION_TRIALS_M2, newId, startTrainingSession, type TrainingSession } from '../session';
import { TrialStage } from '../TrialStage';
import { unlockAudio } from '../unlockAudio';
import { viewportMatches } from '../validate';

type View = { kind: 'running'; run: number } | { kind: 'paused' } | { kind: 'summary'; found: number; total: number };

export function TrainingScreen(props: { db: Db; audio: AudioEngine; settings: Settings; onExit(): void }) {
  const geometry = props.settings.geometry!;
  const windowOk = () => viewportMatches(props.settings.setupViewport, window.innerWidth, window.innerHeight);
  const [view, setView] = useState<View>(() => (windowOk() ? { kind: 'running', run: 0 } : { kind: 'paused' }));
  const training = useRef<TrainingSession | null>(null);

  const resume = () => {
    if (!windowOk()) return;
    unlockAudio(props.audio);
    setView({ kind: 'running', run: Date.now() });
  };

  if (view.kind === 'running') {
    return (
      <TrialStage
        key={view.run}
        geometry={geometry}
        audio={props.audio}
        run={async (deps) => {
          // Der Planer bleibt über Pausen hinweg derselbe; nur beim ersten Mal wird die Sitzung begonnen.
          training.current ??= await startTrainingSession({
            db: props.db,
            deps,
            geometry: currentGeometry(geometry),
            // Alte Einstellungen können ein Fenster unter der heutigen Untergrenze enthalten
            responseWindowMs: Math.max(props.settings.responseWindowMs ?? DEFAULT_WINDOW_MS, props.settings.timing.responseWindowMinMs),
            timing: props.settings.timing,
            trials: SESSION_TRIALS_M2,
            sessionId: newId(),
            now: () => new Date(),
            onTrial: (r) => {
              if (r.outcome === 'hit') props.audio.playChime();
            },
            rng: createRng(Date.now() >>> 0),
          });
          const t = training.current;
          const { aborted } = await t.run(deps);
          if (aborted) {
            setView({ kind: 'paused' });
            return;
          }
          await t.finish();
          setView({ kind: 'summary', ...blockSummary(t.records) });
        }}
      />
    );
  }

  if (view.kind === 'paused') {
    return (
      <div class="patient screen overlay-message" onClick={resume}>
        <div class="patient-right">
          <div class="message-card card">
            <p class="message-text">
              {windowOk()
                ? 'Pause. Tippe zum Weitermachen.'
                : window.innerWidth < window.innerHeight
                  ? 'Bitte das iPad quer halten.'
                  : 'Bitte die App im Vollbild verwenden.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="patient screen summary" onClick={props.onExit}>
      <div class="patient-right">
        <div class="message-card card">
          <p class="summary-lead">Heute gefunden</p>
          <p class="summary-count">
            {view.found} <span class="of">von</span> {view.total}
          </p>
          <div class="summary-bar" role="img" aria-label={`${view.found} von ${view.total} gefunden`}>
            <div style={{ width: `${view.total > 0 ? Math.round((100 * view.found) / view.total) : 0}%` }} />
          </div>
          <p class="message-hint">Tippe, um zurückzugehen.</p>
        </div>
      </div>
    </div>
  );
}
