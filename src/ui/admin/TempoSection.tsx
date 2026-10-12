/** Abschnitt „Tempo“ der Einstellungen: Lichtdauer, Pause und Tippzeit. */
import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_TIMING, TIMING_LIMITS, clampTiming, type TimingSettings } from '../../core/timing';
import type { Db } from '../../store/db';
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
export function TempoSection(props: { db: Db; onChanged(): void }) {
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
