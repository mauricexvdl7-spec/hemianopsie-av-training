/** Begrüßung und Datum für den Startbildschirm (ortszeitabhängig, ohne Intl, damit es überall gleich aussieht). */

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] as const;
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'] as const;

/** 5–10:59 „Guten Morgen“, 11–17:59 „Guten Tag“, 18–22:59 „Guten Abend“, sonst „Hallo“. */
export function greeting(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h < 11) return 'Guten Morgen';
  if (h >= 11 && h < 18) return 'Guten Tag';
  if (h >= 18 && h < 23) return 'Guten Abend';
  return 'Hallo';
}

/** z. B. „Sonntag, 11. Oktober“. */
export function formatDateDe(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}
