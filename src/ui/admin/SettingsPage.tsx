/** Einstellungen im Bereich für Angehörige: Sitzungsdauer, Tempo, Raster, Phase, Vergessen, Einrichtung. */
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { GRID_LIMITS, type GridConfig } from '../../core/blocks';
import type { ControllerState } from '../../core/controller';
import { STAGES, type PhaseState, type Stage } from '../../core/phases';
import { SESSION_MINUTES_LIMITS } from '../../core/schedule';
import type { Db } from '../../store/db';
import { HALF_LIFE_LIMITS, applyGrid, applySessionMinutes, loadOrCreateController, withHalfLife, withManualStage } from './settingsActions';
import { TempoSection } from './TempoSection';

const SAVED = 'Gespeichert. Gilt ab der nächsten Sitzung.';
const REASONS: Record<PhaseState['log'][number]['reason'], string> = { advance: 'Wechsel', regress: 'Rückschritt', manual: 'von Hand' };

const range = (lo: number, hi: number, step = 1): number[] => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
const SESSION_CHOICES = range(SESSION_MINUTES_LIMITS.min, SESSION_MINUTES_LIMITS.max, SESSION_MINUTES_LIMITS.step);

function Choice(props: { label: string; value: number | string; options: ReadonlyArray<number | string>; unit?: string; onChange(v: string): void }) {
  return (
    <label>
      {props.label}
      <br />
      <select aria-label={props.label} value={String(props.value)} onChange={(e) => props.onChange(e.currentTarget.value)}>
        {props.options.map((o) => (
          <option key={o} value={String(o)}>
            {o}
            {props.unit ?? ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section(props: { title: string; children: ComponentChildren }) {
  return (
    <section class="card">
      <h1>{props.title}</h1>
      {props.children}
    </section>
  );
}

function SessionSection(props: { db: Db; onChanged(): void }) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void props.db.getSettings().then((s) => alive && setMinutes(s.sessionMinutes));
    return () => {
      alive = false;
    };
  }, [props.db]);
  if (minutes === null) return null;
  const save = async () => {
    const saved = applySessionMinutes(await props.db.getSettings(), minutes);
    await props.db.saveSettings(saved);
    setMinutes(saved.sessionMinutes);
    setNote(SAVED);
    props.onChanged();
  };
  return (
    <Section title="Sitzungsdauer">
      <Choice
        label="Sitzungsdauer"
        value={minutes}
        options={SESSION_CHOICES}
        unit=" Minuten"
        onChange={(v) => (setNote(null), setMinutes(Number(v)))}
      />
      <p class="hint">Alle 5 Minuten gibt es eine kurze Pause. Länger als 30 Minuten geht nicht.</p>
      <div class="actions">
        <button class="primary" onClick={() => void save()}>
          Sitzungsdauer speichern
        </button>
      </div>
      {note && <p>{note}</p>}
    </Section>
  );
}

const GRID_FIELDS: ReadonlyArray<{ key: keyof GridConfig; label: string; options: readonly number[] }> = [
  { key: 'eccStartDeg', label: 'Start', options: range(GRID_LIMITS.eccStartDeg[0], GRID_LIMITS.eccStartDeg[1]) },
  { key: 'eccStepDeg', label: 'Abstand', options: range(GRID_LIMITS.eccStepDeg[0], GRID_LIMITS.eccStepDeg[1]) },
  { key: 'angleStepDeg', label: 'Winkel', options: GRID_LIMITS.angleStepDeg },
];

function GridSection(props: { db: Db; onChanged(): void }) {
  const [grid, setGrid] = useState<GridConfig | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void props.db.getSettings().then((s) => alive && setGrid(s.grid));
    return () => {
      alive = false;
    };
  }, [props.db]);
  if (!grid) return null;
  const save = async () => {
    const saved = applyGrid(await props.db.getSettings(), grid);
    await props.db.saveSettings(saved);
    setGrid(saved.grid);
    setNote(SAVED);
    props.onChanged();
  };
  return (
    <Section title="Raster der Messpunkte">
      {GRID_FIELDS.map((f) => (
        <Choice
          key={f.key}
          label={f.label}
          value={grid[f.key]}
          options={f.options}
          unit="°"
          onChange={(v) => (setNote(null), setGrid({ ...grid, [f.key]: Number(v) }))}
        />
      ))}
      <p class="hint">Eine Änderung legt eine neue Karte an. Die alte bleibt gespeichert und ist in der Auswertung sichtbar.</p>
      <div class="actions">
        <button class="primary" onClick={() => void save()}>
          Raster speichern
        </button>
      </div>
      {note && <p>{note}</p>}
    </Section>
  );
}

const NEEDS_SETUP = 'Erst die Einrichtung abschließen, dann gibt es diese Einstellung.';

function PhaseSection(props: { db: Db; onChanged(): void }) {
  // `undefined` = lädt noch, `null` = ohne Geometrie nicht verfügbar
  const [controller, setController] = useState<ControllerState | null | undefined>(undefined);
  const [stage, setStage] = useState<Stage>('1');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await loadOrCreateController(props.db, await props.db.getSettings());
      if (!alive) return;
      setController(c);
      if (c) setStage(c.phase.stage);
    })();
    return () => {
      alive = false;
    };
  }, [props.db]);
  if (controller === undefined) return null;
  if (controller === null)
    return (
      <Section title="Phase">
        <p class="hint">{NEEDS_SETUP}</p>
      </Section>
    );

  const apply = async () => {
    if (!window.confirm(`Phase auf Stufe ${stage} setzen? Die Zähler der Stufe beginnen von vorn.`)) return;
    // frisch lesen, damit Karte und Treppe der letzten Sitzung erhalten bleiben
    const fresh = await loadOrCreateController(props.db, await props.db.getSettings());
    if (!fresh) return;
    const saved = withManualStage(fresh, stage, new Date().toISOString());
    await props.db.saveController(saved);
    setController(saved);
    setNote(SAVED);
    props.onChanged();
  };
  const recent = controller.phase.log.slice(-5).reverse();
  return (
    <Section title="Phase">
      <p>Aktuelle Stufe: {controller.phase.stage}</p>
      {recent.length > 0 && (
        <ul>
          {recent.map((e, i) => (
            <li key={i}>
              {new Date(e.atIso).toLocaleDateString('de-DE')}: {e.from} → {e.to} ({REASONS[e.reason]})
            </li>
          ))}
        </ul>
      )}
      <Choice label="Phase" value={stage} options={STAGES} onChange={(v) => (setNote(null), setStage(v as Stage))} />
      <div class="actions">
        <button class="primary" onClick={() => void apply()}>
          Phase setzen
        </button>
      </div>
      {note && <p>{note}</p>}
    </Section>
  );
}

function ForgetSection(props: { db: Db; onChanged(): void }) {
  const [controller, setController] = useState<ControllerState | null | undefined>(undefined);
  const [value, setValue] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await loadOrCreateController(props.db, await props.db.getSettings());
      if (!alive) return;
      setController(c);
      if (c) setValue(String(c.halfLifeSessions));
    })();
    return () => {
      alive = false;
    };
  }, [props.db]);
  if (controller === undefined) return null;
  if (controller === null)
    return (
      <Section title="Vergessen">
        <p class="hint">{NEEDS_SETUP}</p>
      </Section>
    );

  const save = async () => {
    // Leeres Feld ergäbe Number('') = 0 und würde stillschweigend auf die Untergrenze geklemmt
    const halfLife = value.trim() === '' ? NaN : Number(value);
    if (!Number.isFinite(halfLife)) {
      setNote(null);
      setInvalid(true);
      return;
    }
    const fresh = await loadOrCreateController(props.db, await props.db.getSettings());
    if (!fresh) return;
    const saved = withHalfLife(fresh, halfLife);
    await props.db.saveController(saved);
    setController(saved);
    setValue(String(saved.halfLifeSessions));
    setNote(SAVED);
    props.onChanged();
  };
  return (
    <Section title="Vergessen">
      <label>
        Halbwertszeit in Sitzungen ({HALF_LIFE_LIMITS.min} bis {HALF_LIFE_LIMITS.max})
        <br />
        <input
          type="number"
          aria-label="Halbwertszeit in Sitzungen"
          min={HALF_LIFE_LIMITS.min}
          max={HALF_LIFE_LIMITS.max}
          step={1}
          value={value}
          onInput={(e) => (setNote(null), setInvalid(false), setValue(e.currentTarget.value))}
        />
      </label>
      {invalid && (
        <p class="error">
          Bitte eine Zahl von {HALF_LIFE_LIMITS.min} bis {HALF_LIFE_LIMITS.max} eingeben.
        </p>
      )}
      <p class="hint">Nach dieser Zahl von Sitzungen zählt ein älterer Messwert nur noch halb so viel.</p>
      <div class="actions">
        <button class="primary" onClick={() => void save()}>
          Halbwertszeit speichern
        </button>
      </div>
      {note && <p>{note}</p>}
    </Section>
  );
}

export function SettingsPage(props: { db: Db; onChanged(): void }) {
  return (
    <div class="admin screen">
      <div class="admin-inner">
        <div class="actions back">
          <button onClick={() => (location.hash = '#/admin')}>Zurück</button>
        </div>
        <SessionSection db={props.db} onChanged={props.onChanged} />
        <TempoSection db={props.db} onChanged={props.onChanged} />
        <GridSection db={props.db} onChanged={props.onChanged} />
        <PhaseSection db={props.db} onChanged={props.onChanged} />
        <ForgetSection db={props.db} onChanged={props.onChanged} />
        <Section title="Geometrie und Kreuzposition">
          <p class="hint">Bildschirmbreite, Abstand und Lage des Kreuzes werden in der Einrichtung festgelegt.</p>
          <div class="actions">
            <button onClick={() => (location.hash = '#/setup')}>Einrichtung wiederholen</button>
          </div>
        </Section>
      </div>
    </div>
  );
}
