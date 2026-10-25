/**
 * Vollbild am PC (Chrome/Edge): Die Reizorte sind auf die Fenstergröße der Einrichtung abgestimmt,
 * deshalb laufen Einrichtung und Training im Vollbild. Auf dem iPad gibt es die Fullscreen-API nicht
 * (die Home-Bildschirm-App ist ohnehin randlos), dann passiert nichts.
 */

/** Vollbild möglich und noch nicht aktiv. */
export function canFullscreen(doc: Document = document): boolean {
  return Boolean(doc.fullscreenEnabled) && !doc.fullscreenElement;
}

/** Innerhalb eines Klicks aufrufen; wirft nie. */
export function enterFullscreen(doc: Document = document): void {
  if (!canFullscreen(doc)) return;
  try {
    void doc.documentElement.requestFullscreen().catch(() => undefined);
  } catch {
    // Browser lehnt ab: weiter ohne Vollbild (die App zeigt dann den Hinweis zum Vollbild)
  }
}
