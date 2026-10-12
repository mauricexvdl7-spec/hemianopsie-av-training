/** Startseite des Bereichs für Angehörige: Wege zu allen Seiten, Erinnerung an die Sicherung, Hinweis zur Stimme. */
import { useEffect, useState } from 'preact/hooks';
import type { Voice } from '../../io/voice';
import type { Db } from '../../store/db';
import { DISCLAIMER_TEXT } from '../setup/steps/Disclaimer';
import { exportReminderDue } from './exportReminder';

/** Hinweis, wenn keine lokale deutsche Stimme vorhanden ist (Startseite und Ansagen). */
export const NO_GERMAN_VOICE_TEXT =
  'Auf diesem Gerät fehlt eine deutsche Stimme. Bitte in den iPad-Einstellungen unter Bedienungshilfen → Gesprochene Inhalte → Stimmen eine deutsche Stimme laden oder eigene Aufnahmen machen.';

const LINKS: ReadonlyArray<{ href: string; title: string; text: string }> = [
  { href: '#/admin/eval', title: 'Auswertung', text: 'Karte, Verlauf und Kennzahlen' },
  { href: '#/admin/report', title: 'Monatsbericht', text: 'Zum Ausdrucken für die Ärztin oder den Arzt' },
  { href: '#/admin/settings', title: 'Einstellungen', text: 'Sitzungsdauer, Tempo, Raster, Phase, Vergessen' },
  { href: '#/admin/voice', title: 'Ansagen', text: 'Texte ändern, eigene Aufnahmen machen' },
  { href: '#/admin/export', title: 'Export und Sicherung', text: 'Daten sichern, als Tabelle teilen, einspielen' },
  { href: '#/admin/test', title: 'Testseite', text: 'Einzelne Lichter zeigen, Simulation' },
  { href: '#/setup', title: 'Einrichtung wiederholen', text: 'Bildschirm, Abstand, Ton, Reaktionszeit, PIN' },
];

export function AdminHome(props: { db: Db; voice: Voice; onLeave(): void }) {
  const [reminder, setReminder] = useState(false);
  const [hasVoice, setHasVoice] = useState(() => props.voice.hasLocalGermanVoice());

  useEffect(() => {
    let alive = true;
    Promise.all([props.db.getSettings(), props.db.listSessions()])
      .then(([s, sessions]) => {
        const trained = sessions.some((x) => x.kind === 'training' && x.trialCount >= 1);
        if (alive) setReminder(exportReminderDue(s.lastExportAtIso, new Date(), trained));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [props.db]);

  // Die Stimmenliste kommt auf iOS oft erst nach dem ersten Zeichnen
  useEffect(() => {
    setHasVoice(props.voice.hasLocalGermanVoice());
    return props.voice.onVoicesChanged(() => setHasVoice(props.voice.hasLocalGermanVoice()));
  }, [props.voice]);

  return (
    <div class="admin screen">
      <div class="admin-inner">
        <section class="card">
          <h1>Bereich für Angehörige</h1>
          <div class="actions">
            <button class="primary" onClick={() => props.onLeave()}>
              Zurück zum Training
            </button>
          </div>
        </section>

        {reminder && (
          <section class="card notice">
            <p>Bitte die Daten sichern: Wird die App gelöscht, sind alle Daten weg.</p>
            <div class="actions">
              <button onClick={() => (location.hash = '#/admin/export')}>Jetzt sichern</button>
            </div>
          </section>
        )}

        {!hasVoice && (
          <section class="card notice">
            <p>{NO_GERMAN_VOICE_TEXT}</p>
          </section>
        )}

        <nav class="admin-links">
          {LINKS.map((l) => (
            <a key={l.href} class="card admin-link" href={l.href}>
              <h2>{l.title}</h2>
              <span class="hint">{l.text}</span>
            </a>
          ))}
        </nav>

        <p class="hint disclaimer-footer">{DISCLAIMER_TEXT}</p>
      </div>
    </div>
  );
}
