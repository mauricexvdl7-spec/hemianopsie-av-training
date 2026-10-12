/** Einrichtungsassistent (Spec 11): Hinweis, Geometrie, Ton, Reaktionszeit, PIN. */
import { useEffect, useState } from 'preact/hooks';
import type { AudioEngine } from '../../io/audio';
import { DEFAULT_GEOMETRY, type Db, type Settings } from '../../store/db';
import { AudioStep } from './steps/AudioStep';
import { Disclaimer } from './steps/Disclaimer';
import { GeometryStep } from './steps/GeometryStep';
import { PinStep } from './steps/PinStep';
import { ReferenceStep } from './steps/ReferenceStep';

export type SetupStep = 'disclaimer' | 'geometry' | 'audio' | 'reference' | 'pin';

export const SETUP_STEPS: readonly SetupStep[] = ['disclaimer', 'geometry', 'audio', 'reference', 'pin'];

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
  const [step, setStep] = useState<SetupStep>('disclaimer');

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

  const save = async (next: Settings, nextStep: SetupStep | null) => {
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
            onNext={(r) => void save({ ...settings, ...r }, 'pin')}
          />
        );
      case 'pin':
        return <PinStep existing={settings.pin} onNext={(pin) => save({ ...settings, pin }, null)} />;
    }
  })();

  return (
    <div class="admin screen">
      <div class="admin-inner">
        <Stepper index={SETUP_STEPS.indexOf(step)} count={SETUP_STEPS.length} />
        {body}
      </div>
    </div>
  );
}
