/**
 * App-Gerüst: lädt Datenbank und Einstellungen, wählt den Bildschirm nach dem Hash.
 * Die Entsperrung des Bereichs für Angehörige lebt nur im Speicher: Zurück zum Start oder Neuladen sperrt wieder.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AudioEngine, startupAudioSettings } from '../io/audio';
import { createBrowserVoice } from '../io/voice';
import { openDb, type Db, type Settings } from '../store/db';
import { AdminHome } from './admin/AdminHome';
import { ExportPage } from './admin/ExportPage';
import { PinScreen } from './admin/PinScreen';
import { SettingsPage } from './admin/SettingsPage';
import { TestPage } from './admin/TestPage';
import { VoicePage } from './admin/VoicePage';
import { StartScreen } from './patient/StartScreen';
import { TrainingScreen } from './patient/TrainingScreen';
import { resolveRoute } from './routing';
import { SetupWizard } from './setup/SetupWizard';
import { unlockAudio } from './unlockAudio';

export function App() {
  const audio = useMemo(() => new AudioEngine(), []);
  const voice = useMemo(() => createBrowserVoice(audio), [audio]);
  const [db, setDb] = useState<Db | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hash, setHash] = useState(location.hash);
  const [training, setTraining] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = settings ? resolveRoute(hash, settings, unlocked) : null;

  // Wer beim Start oder Training landet, hat den Bereich für Angehörige verlassen
  useEffect(() => {
    if (route === 'start' || route === 'train') setUnlocked(false);
  }, [route]);

  useEffect(() => {
    openDb()
      .then(async (d) => {
        setDb(d);
        const s = await d.getSettings();
        audio.apply(startupAudioSettings(s.audio));
        await loadVoice(d, s);
        setSettings(s);
      })
      .catch(() => setError('Der Speicher dieses Geräts ist nicht verfügbar. Bitte die App vom Home-Bildschirm starten, nicht im privaten Modus.'));
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [audio, voice]);

  /** Eigene Ansagetexte und Aufnahmen an die Stimme geben; ohne lesbare Aufnahmen spricht die Systemstimme. */
  async function loadVoice(d: Db, s: Settings): Promise<void> {
    voice.setTexts(s.announcements);
    const recs = await d.listRecordings().catch(() => []);
    voice.setRecordings(new Map(recs.map((r) => [r.key, r.data])));
  }

  const reload = async () => {
    if (!db) return;
    const s = await db.getSettings();
    audio.apply(startupAudioSettings(s.audio));
    await loadVoice(db, s);
    setSettings(s);
  };

  if (error)
    return (
      <div class="admin screen">
        <div class="admin-inner">
          <section class="card">
            <p class="error">{error}</p>
          </section>
        </div>
      </div>
    );
  if (!db || !settings) return <div class="patient screen" />;

  const leaveAdmin = () => {
    setUnlocked(false);
    location.hash = '#/';
  };

  switch (resolveRoute(hash, settings, unlocked)) {
    case 'pin':
      return (
        <PinScreen
          db={db}
          settings={settings}
          onUnlocked={() => {
            setUnlocked(true);
            // eine eben angelegte PIN in die Einstellungen übernehmen
            void reload();
            if (location.hash === '' || location.hash === '#/') location.hash = '#/admin';
          }}
          onCancel={() => (location.hash = '#/')}
        />
      );
    case 'admin':
    // Seiten aus Task 11–12 folgen; bis dahin die Startseite des Bereichs
    case 'eval':
    case 'report':
      return <AdminHome db={db} voice={voice} onLeave={leaveAdmin} />;
    case 'voice':
      return <VoicePage db={db} voice={voice} audio={audio} onChanged={() => void reload()} />;
    case 'settings':
      return <SettingsPage db={db} onChanged={() => void reload()} />;
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
      return <ExportPage db={db} onImported={() => void reload()} onSettingsChanged={() => void reload()} />;
    case 'test':
      return <TestPage db={db} audio={audio} settings={settings} />;
    case 'start':
    case 'train':
      if (training) {
        return <TrainingScreen db={db} audio={audio} voice={voice} settings={settings} onExit={() => setTraining(false)} />;
      }
      return (
        <StartScreen
          onAdmin={() => (location.hash = '#/admin')}
          onStart={() => {
            // Audio, Stimme und Bildschirmsperre nur innerhalb einer Berührung freischalten (iOS)
            unlockAudio(audio);
            voice.unlock();
            void (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock
              ?.request('screen')
              .catch(() => undefined);
            setTraining(true);
          }}
        />
      );
  }
}
