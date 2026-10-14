/** Aufstellhinweise: Prüft, ob das Gesicht im Kamerabild ungefähr dort liegt, wo es bei der gewählten Kamera-Lage liegen sollte. */
import type { CameraPlacement } from '../../store/db';

/**
 * Bildhälfte (x der Nasenspitze im ungespiegelten Kamerabild, 0..1), in der das Gesicht bei Lage 'side' liegen soll.
 *
 * MUSS AM GERÄT BESTÄTIGT WERDEN (Kamera-Testseite: „Nase im Bild x …“ ablesen, Kamera rechts, er sitzt vor dem Kreuz).
 *
 * Begründung für 'high': Das iPad steht quer, die Kamera an der rechten Schmalseite. Er sitzt vor dem Kreuz (2/3 der
 * Breite), von der Kamera aus also zur Bildschirmmitte hin, das heißt zu seiner eigenen linken Seite. Das ungespiegelte
 * Bild der Frontkamera zeigt ihn wie ein Foto, das jemand von ihm macht: Seine linke Seite liegt rechts im Bild. Rückt er
 * insgesamt nach seiner linken Seite, wandert das Gesicht also nach rechts im Bild, zu großem x. Unsicher ist, ob Safari
 * das Bild im Querformat schon gedreht oder gespiegelt liefert; dann wäre es 'low'.
 */
export const SIDE_EXPECTS_FACE_X: 'low' | 'high' = 'high';

/** Mehr als so weit jenseits der Bildmitte (in Bildbreiten) liegt die Nase in der falschen Hälfte. */
const SIDE_WRONG_HALF_MARGIN = 0.15;
/** Bei Lage 'top' soll die Nase vertikal in diesem Bereich des Bilds liegen. */
const TOP_Y_RANGE = { min: 0.25, max: 0.75 } as const;

export const NO_FACE_HINT = 'Kein Gesicht im Bild. Bitte gerade vor das iPad setzen.';
export const SIDE_HINT = 'Bitte das iPad so drehen, dass die Kamera rechts ist.';
export const TOP_HINT = 'Bitte das iPad gerade vor das Gesicht stellen.';

/** Prüft die Gesichtslage im Kamerabild: 'side' erwartet das Gesicht in der dem Bildschirm zugewandten Bildhälfte; liefert Hinweistext oder null. */
export function placementHint(placement: CameraPlacement, facePx: { x: number; y: number } | null): string | null {
  if (!facePx) return NO_FACE_HINT;
  if (placement === 'side') {
    // Abstand von der Mitte in Richtung der falschen Hälfte
    const towardWrong = SIDE_EXPECTS_FACE_X === 'high' ? 0.5 - facePx.x : facePx.x - 0.5;
    return towardWrong > SIDE_WRONG_HALF_MARGIN ? SIDE_HINT : null;
  }
  return facePx.y < TOP_Y_RANGE.min || facePx.y > TOP_Y_RANGE.max ? TOP_HINT : null;
}
