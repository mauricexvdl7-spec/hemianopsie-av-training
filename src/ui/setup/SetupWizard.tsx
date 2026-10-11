/** Einrichtungsassistent (Spec 11): Hinweis, Geometrie, Ton, Reaktionszeit. */
import { useEffect, useState } from 'preact/hooks';
import type { AudioEngine } from '../../io/audio';
import { DEFAULT_GEOMETRY, type Db, type Settings } from '../../store/db';
import { AudioStep } from './steps/AudioStep';
import { Disclaimer } from './steps/Disclaimer';
import { GeometryStep } from './steps/GeometryStep';
import { ReferenceStep } from './steps/ReferenceStep';

type Step = 'disclaimer' | 'geometry' | 'audio' | 'reference';

export function SetupWizard(props: { db: Db; audio: AudioEngine; onDone(): void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [step, setStep] = useState<Step>('disclaimer');

  useEffect(() => {
    void props.db.getSettings().then(setSettings);
  }, [props.db]);

  if (!settings) return <div class="admin screen">Lade …</div>;

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

  return <div class="admin screen">{body}</div>;
}
