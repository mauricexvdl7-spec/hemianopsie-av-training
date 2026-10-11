/** Export und Wiederherstellung (Stand M1 ohne PIN, nur über #/export erreichbar). */
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_TIMING, TIMING_LIMITS, clampTiming, type TimingSettings } from '../../core/timing';
import type { Db } from '../../store/db';
import { exportAll, importAll, previewBundle, shareOrDownload, trialsToCsv } from '../../store/exportData';
import { dayKey } from '../session';
import { applyTiming, formatSeconds, visibleMs } from './tempo';

const RAMP_PAIR_MS = 300; // zwei Rampen zu je 150 ms: Anzeige „sichtbar“ = Plateau + 300 ms

/** Schieber in Sekunden: Wert in ms, Grenzen aus TIMING_LIMITS. */
function SecondsSlider(props: { label: string; ms: number; min: number; max: number; step: number; onChange(ms: number): void }) {
  return (
    <label>
      {props.label}: {formatSeconds(props.ms)}
      <br />
      <input
        type="range"
        min={props.min / 1000}
        max={props.max / 1000}
        step={props.step}
        value={props.ms / 1000}
        onInput={(e) => props.onChange(Math.round(Number(e.currentTarget.value) * 1000))}
      />
    </label>
  );
}

/** Abschnitt „Tempo“: Lichtdauer, Pause und Tippzeit; gilt ab der nächsten Sitzung. */
function TempoSection(props: { db: Db; onChanged(): void }) {
  const [timing, setTiming] = useState<TimingSettings | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    props.db
      .getSettings()
      .then((s) => alive && setTiming(s.timing))
      .catch(() => alive && setTiming(DEFAULT_TIMING));
    return () => {
      alive = false;
    };
  }, [props.db]);

  if (!timing) return null;
  // Funktionale Aktualisierung: mehrere Eingaben vor dem nächsten Zeichnen dürfen sich nicht gegenseitig überschreiben.
  const set = (patch: (prev: TimingSettings) => Partial<TimingSettings>) => {
    setNote(null);
    setTiming((prev) => (prev ? clampTiming({ ...prev, ...patch(prev) }) : prev));
  };
  const save = async (t: TimingSettings) => {
    // frisch lesen, damit nichts überschrieben wird, was sich inzwischen geändert hat
    const saved = applyTiming(await props.db.getSettings(), t);
    await props.db.saveSettings(saved);
    setTiming(saved.timing);
    setNote(`Gespeichert. Gilt ab der nächsten Sitzung. Zeit zum Tippen derzeit ${formatSeconds(saved.responseWindowMs ?? 0)}.`);
    props.onChanged();
  };

  const [plLo, plHi] = TIMING_LIMITS.plateauMs;
  const [wMinLo, wMinHi] = TIMING_LIMITS.waitMinMs;
  const [wMaxLo, wMaxHi] = TIMING_LIMITS.waitMaxMs;
  const [rwLo, rwHi] = TIMING_LIMITS.responseWindowMinMs;
  return (
    <section class="card">
      <h1>Tempo</h1>
      <SecondsSlider
        label="Licht sichtbar"
        ms={visibleMs(timing.plateauMs)}
        min={plLo + RAMP_PAIR_MS}
        max={plHi + RAMP_PAIR_MS}
        step={0.1}
        onChange={(ms) => set(() => ({ plateauMs: ms - RAMP_PAIR_MS }))}
      />
      <SecondsSlider
        label="Pause zwischen den Lichtern, von"
        ms={timing.waitMinMs}
        min={wMinLo}
        max={wMinHi}
        step={0.5}
        onChange={(ms) => set(() => ({ waitMinMs: ms }))}
      />
      <SecondsSlider
        label="Pause zwischen den Lichtern, bis"
        ms={timing.waitMaxMs}
        min={wMaxLo}
        max={wMaxHi}
        step={0.5}
        onChange={(ms) => set((prev) => ({ waitMaxMs: ms, waitMinMs: Math.min(prev.waitMinMs, ms) }))}
      />
      <SecondsSlider
        label="Zeit zum Tippen mindestens"
        ms={timing.responseWindowMinMs}
        min={rwLo}
        max={rwHi}
        step={0.1}
        onChange={(ms) => set(() => ({ responseWindowMinMs: ms }))}
      />
      <p class="hint">
        Die Pause ist nie kürzer als 1 Sekunde. Änderungen gelten ab der nächsten Sitzung, eine laufende Sitzung behält ihr Tempo.
      </p>
      <div class="actions">
        <button class="primary" onClick={() => void save(timing)}>
          Tempo speichern
        </button>
        <button onClick={() => set(() => DEFAULT_TIMING)}>Standard wiederherstellen</button>
      </div>
      {note && <p>{note}</p>}
    </section>
  );
}

export function ExportPage(props: { db: Db; onImported(): void; onSettingsChanged?(): void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ bundle: unknown; sessions: number; trials: number } | null>(null);
  const [ready, setReady] = useState<File | null>(null);
  const stamp = dayKey(new Date());

  // Zwei Schritte: erst Datei bauen (liest die Datenbank), dann im nächsten Tippen teilen
  const prepareJson = async () => {
    const bundle = await exportAll(props.db, new Date().toISOString());
    setReady(new File([JSON.stringify(bundle, null, 1)], `sehtraining-${stamp}.json`, { type: 'application/json' }));
  };

  const prepareCsv = async () => {
    const trials = await props.db.listTrials();
    trials.sort((a, b) => a.startedAtIso.localeCompare(b.startedAtIso) || a.index - b.index);
    setReady(new File([trialsToCsv(trials)], `sehtraining-${stamp}.csv`, { type: 'text/csv' }));
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
              Bereit: {ready.name}
              <div class="actions">
                <button class="primary" onClick={() => void shareOrDownload(ready)}>
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

        <TempoSection db={props.db} onChanged={() => props.onSettingsChanged?.()} />

        <section class="card">
          <h1>Weiteres</h1>
          <div class="actions">
            <button onClick={() => (location.hash = '#/setup')}>Einrichtung wiederholen</button>
            <button onClick={() => (location.hash = '#/test')}>Testseite</button>
            <button onClick={() => (location.hash = '#/')}>Zum Start</button>
          </div>
        </section>
      </div>
    </div>
  );
}
