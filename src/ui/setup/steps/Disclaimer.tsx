export const DISCLAIMER_TEXT =
  'Diese App ist kein Medizinprodukt und stellt keine Diagnosen. Sie ergänzt ein ärztlich begleitetes Training und ersetzt es nicht.';

export function Disclaimer(props: { onAccept(): void }) {
  return (
    <section class="card">
      <h1>Wichtiger Hinweis</h1>
      <p>{DISCLAIMER_TEXT}</p>
      <p class="hint">
        Bitte besprich das Training mit der behandelnden Ärztin oder dem behandelnden Arzt. Bei Unwohlsein, Kopfschmerzen oder
        ungewohnten Seheindrücken das Training beenden.
      </p>
      <div class="actions">
        <button class="primary" onClick={props.onAccept}>
          Verstanden
        </button>
      </div>
    </section>
  );
}
