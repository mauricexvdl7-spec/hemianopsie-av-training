/** PIN-Eingabe vor dem Bereich für Angehörige; ohne gespeicherte PIN wird zuerst eine festgelegt. */
import { useState } from 'preact/hooks';
import type { Db, PinRecord, Settings } from '../../store/db';
import { PinInput, PinStep } from '../setup/steps/PinStep';
import { isValidPin, verifyPin } from './pin';

/** Wort, das zum Löschen einer vergessenen PIN eingetippt werden muss (Groß-/Kleinschreibung egal). */
const RESET_WORD = 'ZURÜCKSETZEN';

type Mode = 'entry' | 'reset' | 'create';

export function PinScreen(props: { db: Db; settings: Settings; onUnlocked(): void; onCancel(): void; onPinCleared(): void }) {
  const stored = props.settings.pin;
  const [mode, setMode] = useState<Mode>(stored ? 'entry' : 'create');
  return (
    <div class="admin screen">
      <div class="admin-inner">
        {mode === 'entry' && stored ? (
          <PinEntry pin={stored} onUnlocked={props.onUnlocked} onCancel={props.onCancel} onForgot={() => setMode('reset')} />
        ) : mode === 'reset' ? (
          <PinReset
            db={props.db}
            onCleared={() => {
              setMode('create');
              props.onPinCleared();
            }}
            onCancel={() => setMode('entry')}
          />
        ) : (
          <PinCreate db={props.db} onUnlocked={props.onUnlocked} onCancel={props.onCancel} />
        )}
      </div>
    </div>
  );
}

function PinEntry(props: { pin: PinRecord; onUnlocked(): void; onCancel(): void; onForgot(): void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!isValidPin(value)) {
      setError('Bitte 4 Ziffern eingeben.');
      return;
    }
    setBusy(true);
    let ok: boolean;
    try {
      ok = await verifyPin(value, props.pin);
    } catch {
      setError('Die PIN konnte nicht geprüft werden.');
      return;
    } finally {
      setBusy(false);
    }
    if (ok) {
      props.onUnlocked();
    } else {
      // Keine Sperre nach Fehlversuchen, nur der Hinweis
      setError('Falsche PIN.');
      setValue('');
    }
  };

  return (
    <section class="card">
      <h1>Bereich für Angehörige</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <PinInput
          label="PIN"
          value={value}
          autoFocus
          onInput={(v) => {
            setValue(v);
            setError(null);
          }}
        />
        {error && <p class="error">{error}</p>}
        <div class="actions">
          <button type="submit" class="primary" disabled={busy}>
            Öffnen
          </button>
          <button type="button" onClick={() => props.onCancel()}>
            Abbrechen
          </button>
        </div>
      </form>
      <button type="button" class="link" onClick={() => props.onForgot()}>
        PIN vergessen?
      </button>
    </section>
  );
}

/** Vergessene PIN löschen: nur die PIN, alle Trainingsdaten bleiben. Danach wird eine neue festgelegt. */
function PinReset(props: { db: Db; onCleared(): void; onCancel(): void }) {
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmed = word.trim().toUpperCase() === RESET_WORD;

  const clear = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      // frisch lesen, damit nichts überschrieben wird, was sich inzwischen geändert hat
      const s = await props.db.getSettings();
      await props.db.saveSettings({ ...s, pin: null });
    } catch {
      setError('Die PIN konnte nicht gelöscht werden.');
      setBusy(false);
      return;
    }
    props.onCleared();
  };

  return (
    <section class="card">
      <h1>PIN vergessen</h1>
      <p>Die PIN wird gelöscht. Alle Trainingsdaten bleiben erhalten. Danach legst du eine neue PIN fest. Zum Bestätigen {RESET_WORD} eintippen.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void clear();
        }}
      >
        <input
          type="text"
          aria-label="Bestätigung"
          autoComplete="off"
          value={word}
          onInput={(e) => {
            setWord(e.currentTarget.value);
            setError(null);
          }}
        />
        {error && <p class="error">{error}</p>}
        <div class="actions">
          <button type="submit" class="primary" disabled={!confirmed || busy}>
            PIN löschen
          </button>
          <button type="button" onClick={() => props.onCancel()}>
            Abbrechen
          </button>
        </div>
      </form>
    </section>
  );
}

function PinCreate(props: { db: Db; onUnlocked(): void; onCancel(): void }) {
  // Fehler beim Speichern zeigt PinStep selbst an und erlaubt einen neuen Versuch
  const save = async (pin: PinRecord) => {
    // frisch lesen, damit nichts überschrieben wird, was sich inzwischen geändert hat
    const s = await props.db.getSettings();
    await props.db.saveSettings({ ...s, pin });
    props.onUnlocked();
  };

  return (
    <>
      <PinStep existing={null} onNext={save} />
      <div class="actions">
        <button onClick={() => props.onCancel()}>Abbrechen</button>
      </div>
    </>
  );
}
