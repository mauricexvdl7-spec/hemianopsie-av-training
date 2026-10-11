/** Hilfen für den Abschnitt „Tempo“ der Verwaltung: Umrechnung der Schieber und Speichern ins Einstellungsobjekt. */
import { DEFAULT_WINDOW_MS, responseWindowFromReference } from '../../core/trial';
import { RAMP_MS } from '../../core/stimulus';
import { clampTiming, type TimingSettings } from '../../core/timing';
import type { Settings } from '../../store/db';

/** Gesamte Sichtbarkeit des Lichts (Rampe hoch + Plateau + Rampe runter) in ms. */
export const visibleMs = (plateauMs: number): number => plateauMs + 2 * RAMP_MS;

/** Anzeige in Sekunden mit einer Nachkommastelle und Komma, z. B. 1500 → „1,5 s“. */
export const formatSeconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

/**
 * Übernimmt neues Tempo in die Einstellungen (geklemmt). Das Antwortfenster wird mit der neuen Untergrenze neu berechnet:
 * aus den Referenz-Reaktionszeiten, wenn mindestens 5 vorliegen, sonst Standardwert, aber nie unter der Untergrenze.
 */
export function applyTiming(settings: Settings, timing: Partial<TimingSettings>): Settings {
  const t = clampTiming(timing);
  const responseWindowMs =
    settings.referenceRtsMs.length >= 5
      ? responseWindowFromReference(settings.referenceRtsMs, t.responseWindowMinMs)
      : Math.max(DEFAULT_WINDOW_MS, t.responseWindowMinMs);
  return { ...settings, timing: t, responseWindowMs };
}
