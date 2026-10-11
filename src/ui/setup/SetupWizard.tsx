/** Einrichtungsassistent (Spec 11): Hinweis, Geometrie, Ton, Reaktionszeit. */
import { useEffect, useState } from 'preact/hooks';
import type { AudioEngine } from '../../io/audio';
import { DEFAULT_GEOMETRY, type Db, type Settings } from '../../store/db';
import { AudioStep } from './steps/AudioStep';
import { Disclaimer } from './steps/Disclaimer';
import { GeometryStep } from './steps/GeometryStep';
import { ReferenceStep } from './steps/ReferenceStep';

type Step = 'disclaimer' | 'geometry' | 'audio' | 'reference';

const STEPS: readonly Step[] = ['disclaimer', 'geometry', 'audio', 'reference'];

/** Schritt-Anzeige: „Schritt 2 von 4“ und Punkte (erledigt, aktuell, offen). */
export function Stepper(props: { index: number; count: number }) {
  return (
    <div class="stepper">
      <span>
        Schritt {props.index + 1} von {props.count}
      </span>
      <span class="stepper-dots" aria-hidden="true">
        {Array.from({ length: props.count }, (_, i) => (
          <span key={i} class={i < props.index ? 'done' : i === props.index ? 'current' : ''} />
        ))}
      </span>
    </div>
  );
}

export function SetupWizard(props: { db: Db; audio: AudioEngine; onDone(): void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [step, setStep] = useState<Step>('disclaimer');

  useEffect(() => {
    void props.db.getSettings().then(setSettings);
  }, [props.db]);

  if (!settings)
    return (
      <div class="admin screen">
        <div class="admin-inner">
          <p class="hint">Lade …</p>
        </div>
      </div>
    );

  const save = async (next: Settings, nextStep: Step | null) => {
    await props.db.saveSettings(next);
    setSettings(next);
    if (nextStep) setStep(nextStep);
    else props.onDone();
  };

  const body = (() => {
    switch (step) {
      case 'disclaimer':
        return <Disclaimer onAccept={() => void save({ ...settings, disclaimerAcceptedAt: new Date().toISOString() }, 'geometry')} />;
      case 'geometry':
        return <GeometryStep initial={settings.geometry ?? DEFAULT_GEOMETRY} onNext={(geometry) => void save({ ...settings, geometry, setupViewport: { width: window.innerWidth, height: window.innerHeight } }, 'audio')} />;
      case 'audio':
        return (
          <AudioStep
            audio={props.audio}
            initial={settings.audio}
            onNext={(audio) => {
              props.audio.apply(audio);
              void save({ ...settings, audio }, 'reference');
            }}
          />
        );
      case 'reference':
        return (
          <ReferenceStep
            db={props.db}
            audio={props.audio}
            geometry={settings.geometry ?? DEFAULT_GEOMETRY}
            timing={settings.timing}
            onNext={(r) => void save({ ...settings, ...r }, null)}
          />
        );
    }
  })();

  return (
    <div class="admin screen">
      <div class="admin-inner">
        <Stepper index={STEPS.indexOf(step)} count={STEPS.length} />
        {body}
      </div>
    </div>
  );
}
