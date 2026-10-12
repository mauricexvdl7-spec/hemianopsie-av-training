import { formatDateDe, greeting } from '../greeting';
import { AdminCorner } from './AdminCorner';

/**
 * Startbildschirm für ihn: Begrüßung, Datum und ein großer runder Knopf, alles rechts der Mitte gestapelt;
 * ein Tippen irgendwo startet ebenfalls. Oben rechts liegt unsichtbar der Zugang für Angehörige (lang drücken).
 * Bewusst onClick: iOS schaltet Audio nur bei pointerup/touchend/click frei, nicht bei pointerdown.
 */
export function StartScreen(props: { onStart(): void; onAdmin(): void; now?: Date }) {
  const now = props.now ?? new Date();
  return (
    <div class="patient screen start-screen" onClick={() => props.onStart()}>
      <div class="patient-right">
        <div class="start-greeting">{greeting(now)}</div>
        <div class="start-date">{formatDateDe(now)}</div>
        <button class="start-button" aria-label="Start">
          Start
        </button>
        <div class="start-note">Lautstärke etwa halb</div>
      </div>
      <AdminCorner onLongPress={() => props.onAdmin()} />
    </div>
  );
}
