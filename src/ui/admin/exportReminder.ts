/** Erinnerung an die Datensicherung auf der Startseite des PIN-Bereichs. */

export const EXPORT_REMINDER_DAYS = 30;

const DAY_MS = 86_400_000;

/** Fällig, wenn es Trainingssitzungen gibt und noch nie oder vor mindestens 30 Tagen als JSON gesichert wurde. */
export function exportReminderDue(lastExportAtIso: string | null, now: Date, hasTrainingSessions: boolean): boolean {
  if (!hasTrainingSessions) return false;
  if (lastExportAtIso === null) return true;
  const last = Date.parse(lastExportAtIso);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= EXPORT_REMINDER_DAYS * DAY_MS;
}
