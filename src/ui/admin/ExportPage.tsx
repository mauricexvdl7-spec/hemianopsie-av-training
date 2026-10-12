/** Export und Wiederherstellung im Bereich für Angehörige. */
import { useState } from 'preact/hooks';
import type { Db } from '../../store/db';
import { exportAll, importAll, previewBundle, shareOrDownload, trialsToCsv } from '../../store/exportData';
import { dayKey } from '../session';

export function ExportPage(props: { db: Db; onImported(): void; onSettingsChanged?(): void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ bundle: unknown; sessions: number; trials: number } | null>(null);
  /** Fertige Datei zum Teilen; nur eine JSON-Sicherung zählt für die Erinnerung. */
  const [ready, setReady] = useState<{ file: File; backup: boolean } | null>(null);
  const stamp = dayKey(new Date());

  // Zwei Schritte: erst Datei bauen (liest die Datenbank), dann im nächsten Tippen teilen
  const prepareJson = async () => {
    const bundle = await exportAll(props.db, new Date().toISOString());
    setReady({ file: new File([JSON.stringify(bundle, null, 1)], `sehtraining-${stamp}.json`, { type: 'application/json' }), backup: true });
  };

  const prepareCsv = async () => {
    const trials = await props.db.listTrials();
    trials.sort((a, b) => a.startedAtIso.localeCompare(b.startedAtIso) || a.index - b.index);
    setReady({ file: new File([trialsToCsv(trials)], `sehtraining-${stamp}.csv`, { type: 'text/csv' }), backup: false });
  };

  /** Teilen direkt aus dem Tippen; nach einer nicht abgebrochenen JSON-Sicherung den Zeitpunkt merken. */
  const share = async (r: { file: File; backup: boolean }) => {
    const shared = await shareOrDownload(r.file);
    if (!shared || !r.backup) return;
    const s = await props.db.getSettings();
    await props.db.saveSettings({ ...s, lastExportAtIso: new Date().toISOString() });
    props.onSettingsChanged?.();
  };

  const pickFile = async (file: File | undefined) => {
    setMessage(null);
    if (!file) return;
    try {
      const bundle: unknown = JSON.parse(await file.text());
      // Prüfung und Zahlen kommen aus dem Import selbst, damit Sicherungen aller Versionen (1 und 2) angenommen werden
      const preview = previewBundle(bundle);
      if (!preview) {
        setMessage('Unbekanntes Format: Das ist keine Sicherung dieser App.');
        return;
      }
      setPending({ bundle, ...preview });
    } catch {
      setMessage('Die Datei konnte nicht gelesen werden.');
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    try {
      const r = await importAll(props.db, pending.bundle);
      setMessage(`Eingespielt: ${r.sessions} Sitzungen, ${r.trials} Durchgänge.`);
      setPending(null);
      props.onImported();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div class="admin screen">
      <div class="admin-inner">
        <div class="actions back">
          <button onClick={() => (location.hash = '#/admin')}>Zurück</button>
        </div>
        <section class="card">
          <h1>Daten sichern</h1>
          <p class="hint">
            Alle Daten liegen nur auf diesem iPad. Wird die App gelöscht, sind sie weg. Deshalb regelmäßig sichern, zum Beispiel per AirDrop
            oder Mail an dich. Sicherungen nie in das öffentliche Repository legen.
          </p>
          <div class="actions">
            <button class="primary" onClick={() => void prepareJson()}>
              Alles sichern (JSON)
            </button>
            <button onClick={() => void prepareCsv()}>Durchgänge als Tabelle (CSV)</button>
          </div>
          {ready && (
            <div class="result-line">
              Bereit: {ready.file.name}
              <div class="actions">
                <button class="primary" onClick={() => void share(ready)}>
                  Teilen oder speichern
                </button>
              </div>
            </div>
          )}
        </section>

        <section class="card">
          <h1>Sicherung einspielen</h1>
          <input type="file" accept="application/json,.json" onChange={(e) => void pickFile(e.currentTarget.files?.[0])} />
          {pending && (
            <div class="result-line">
              {pending.sessions} Sitzungen, {pending.trials} Durchgänge – vorhandene Daten werden ersetzt.
              <div class="actions">
                <button class="primary" onClick={() => void confirmImport()}>
                  Ersetzen
                </button>
                <button onClick={() => setPending(null)}>Abbrechen</button>
              </div>
            </div>
          )}
          {message && <p>{message}</p>}
        </section>
      </div>
    </div>
  );
}
