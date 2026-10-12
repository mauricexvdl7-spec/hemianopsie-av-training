/** PIN festlegen (letzter Schritt der Einrichtung, auch beim ersten Öffnen des PIN-Bereichs ohne PIN). */
import { useState } from 'preact/hooks';
import type { PinRecord } from '../../../store/db';
import { createPinRecord, isValidPin } from '../../admin/pin';

/** Verdecktes Eingabefeld für 4 Ziffern mit Ziffernblock auf dem iPad. */
export function PinInput(props: { label: string; value: string; onInput(v: string): void; autoFocus?: boolean }) {
  return (
    <label>
      {props.label}
      <br />
      <input
        class="pin-input"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        autocomplete="off"
        autoFocus={props.autoFocus}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </label>
  );
}

/** Zwei Felder; „PIN speichern“ nur bei gültiger und gleicher PIN. Bei vorhandener PIN zusätzlich „PIN behalten“. */
export function PinStep(props: { existing: PinRecord | null; onNext(pin: PinRecord): void }) {
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const canSave = isValidPin(pin) && pin === repeat && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    props.onNext(await createPinRecord(pin));
  };

  return (
    <section class="card">
      <h1>PIN für Angehörige</h1>
      <p class="hint">
        Die PIN schützt Einstellungen, Auswertung und Sicherung. Den Bereich öffnest du, indem du auf dem Startbildschirm die Ecke oben
        rechts 3 Sekunden lang gedrückt hältst. Bitte die PIN gut merken.
      </p>
      {props.existing && <p class="hint">Es gibt schon eine PIN. Du kannst sie behalten oder eine neue festlegen.</p>}
      <PinInput label="Neue PIN (4 Ziffern)" value={pin} onInput={setPin} />
      <PinInput label="PIN wiederholen" value={repeat} onInput={setRepeat} />
      {repeat.length === 4 && isValidPin(pin) && pin !== repeat && <p class="error">Die beiden Eingaben sind verschieden.</p>}
      <div class="actions">
        <button class="primary" disabled={!canSave} onClick={() => void save()}>
          PIN speichern
        </button>
        {props.existing && (
          <button disabled={busy} onClick={() => props.existing && props.onNext(props.existing)}>
            PIN behalten
          </button>
        )}
      </div>
    </section>
  );
}
