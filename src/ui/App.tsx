/** App-Gerüst: lädt Datenbank und Einstellungen, wählt den Bildschirm nach dem Hash. */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AudioEngine, startupAudioSettings } from '../io/audio';
import { openDb, type Db, type Settings } from '../store/db';
import { ExportPage } from './admin/ExportPage';
import { TestPage } from './admin/TestPage';
import { StartScreen } from './patient/StartScreen';
import { TrainingScreen } from './patient/TrainingScreen';
import { resolveRoute } from './routing';
import { SetupWizard } from './setup/SetupWizard';
import { unlockAudio } from './unlockAudio';

export function App() {
  const audio = useMemo(() => new AudioEngine(), []);
  const [db, setDb] = useState<Db | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hash, setHash] = useState(location.hash);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openDb()
      .then(async (d) => {
        setDb(d);
        const s = await d.getSettings();
        audio.apply(startupAudioSettings(s.audio));
        setSettings(s);
      })
      .catch(() => setError('Der Speicher dieses Geräts ist nicht verfügbar. Bitte die App vom Home-Bildschirm starten, nicht im privaten Modus.'));
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [audio]);

  const reload = async () => {
    if (!db) return;
    const s = await db.getSettings();
    audio.apply(startupAudioSettings(s.audio));
    setSettings(s);
  };

  if (error) return <div class="admin screen">{error}</div>;
  if (!db || !settings) return <div class="patient screen" />;

  switch (resolveRoute(hash, settings)) {
    case 'setup':
      return (
        <SetupWizard
          db={db}
          audio={audio}
          onDone={() => {
            void reload();
            location.hash = '#/';
          }}
        />
      );
    case 'export':
      return <ExportPage db={db} onImported={() => void reload()} />;
    case 'test':
      return <TestPage db={db} audio={audio} settings={settings} />;
    case 'start':
    case 'train':
      if (training) {
        return <TrainingScreen db={db} audio={audio} settings={settings} onExit={() => setTraining(false)} />;
      }
      return (
        <StartScreen
          onStart={() => {
            // Audio und Bildschirmsperre nur innerhalb einer Berührung freischalten (iOS)
            unlockAudio(audio);
            void (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock
              ?.request('screen')
              .catch(() => undefined);
            setTraining(true);
          }}
        />
      );
  }
}
