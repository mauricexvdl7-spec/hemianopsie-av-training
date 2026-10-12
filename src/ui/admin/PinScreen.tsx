/** PIN-Eingabe vor dem Bereich für Angehörige; ohne gespeicherte PIN wird zuerst eine festgelegt. */
import { useState } from 'preact/hooks';
import type { Db, PinRecord, Settings } from '../../store/db';
import { PinInput, PinStep } from '../setup/steps/PinStep';
import { isValidPin, verifyPin } from './pin';

export function PinScreen(props: { db: Db; settings: Settings; onUnlocked(): void; onCancel(): void }) {
  const stored = props.settings.pin;
  return (
    <div class="admin screen">
      <div class="admin-inner">
        {stored ? (
          <PinEntry pin={stored} onUnlocked={props.onUnlocked} onCancel={props.onCancel} />
        ) : (
          <PinCreate db={props.db} onUnlocked={props.onUnlocked} onCancel={props.onCancel} />
        )}
      </div>
    </div>
  );
}

function PinEntry(props: { pin: PinRecord; onUnlocked(): void; onCancel(): void }) {
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
    const ok = await verifyPin(value, props.pin);
    setBusy(false);
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
    </section>
  );
}

function PinCreate(props: { db: Db; onUnlocked(): void; onCancel(): void }) {
  const [error, setError] = useState<string | null>(null);
  // neuer Schlüssel nach einem Fehler: Felder leeren und Knopf wieder freigeben
  const [attempt, setAttempt] = useState(0);

  const save = async (pin: PinRecord) => {
    try {
      // frisch lesen, damit nichts überschrieben wird, was sich inzwischen geändert hat
      const s = await props.db.getSettings();
      await props.db.saveSettings({ ...s, pin });
      props.onUnlocked();
    } catch {
      setError('Die PIN konnte nicht gespeichert werden.');
      setAttempt((a) => a + 1);
    }
  };

  return (
    <>
      <PinStep key={attempt} existing={null} onNext={(pin) => void save(pin)} />
      {error && <p class="error">{error}</p>}
      <div class="actions">
        <button onClick={() => props.onCancel()}>Abbrechen</button>
      </div>
    </>
  );
}
