/** Routing per Hash und einfache Auswertungen für die Bildschirme. */
import type { TrialRecord } from '../core/types';
import type { Settings } from '../store/db';

export type Route = 'start' | 'train' | 'setup' | 'pin' | 'admin' | 'settings' | 'voice' | 'eval' | 'report' | 'export' | 'test';

const ROUTES: Record<string, Route> = {
  '#/setup': 'setup',
  '#/train': 'train',
  '#/admin': 'admin',
  '#/admin/settings': 'settings',
  '#/admin/voice': 'voice',
  '#/admin/eval': 'eval',
  '#/admin/report': 'report',
  '#/admin/export': 'export',
  '#/admin/test': 'test',
  // alte Adressen aus M1/M2
  '#/export': 'export',
  '#/test': 'test',
};

/** Routen, die nur nach PIN-Eingabe erreichbar sind (Einrichtung erst, wenn eine Geometrie existiert). */
const PROTECTED: ReadonlySet<Route> = new Set<Route>(['admin', 'settings', 'voice', 'eval', 'report', 'export', 'test', 'setup']);

/**
 * Ohne bestätigten Hinweis gibt es keine Nutzung; der PIN-Bereich und eine wiederholte Einrichtung brauchen die PIN;
 * ohne Geometrie kein Training (Export bleibt zur Datenrettung erreichbar).
 * unlocked: PIN in dieser App-Sitzung eingegeben.
 */
export function resolveRoute(hash: string, s: Settings, unlocked: boolean): Route {
  if (!s.disclaimerAcceptedAt) return 'setup';
  const r = ROUTES[hash] ?? 'start';
  if (s.geometry && PROTECTED.has(r) && !unlocked) return 'pin';
  if (!s.geometry && r !== 'export') return 'setup';
  return r;
}

/** „Heute X von Y gefunden“: linke Durchgänge mit Reiz, abgebrochene zählen nicht. */
export function blockSummary(recs: readonly TrialRecord[]): { found: number; total: number } {
  const left = recs.filter((r) => r.kind === 'left' && r.outcome !== 'aborted');
  return { found: left.filter((r) => r.outcome === 'hit').length, total: left.length };
}
