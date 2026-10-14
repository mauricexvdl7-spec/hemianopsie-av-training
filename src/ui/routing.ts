/** Routing per Hash und einfache Auswertungen für die Bildschirme. */
import type { TrialRecord } from '../core/types';
import type { Settings } from '../store/db';

export type Route = 'start' | 'train' | 'setup' | 'pin' | 'admin' | 'settings' | 'voice' | 'eval' | 'report' | 'export' | 'test' | 'camera';

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
  '#/admin/camera': 'camera',
  // alte Adressen aus M1/M2
  '#/export': 'export',
  '#/test': 'test',
};

/** Routen des Bereichs für Angehörige: immer nur nach PIN-Eingabe erreichbar, auch ohne Geometrie. */
const ADMIN_ROUTES: ReadonlySet<Route> = new Set<Route>(['admin', 'settings', 'voice', 'eval', 'report', 'export', 'test', 'camera']);

/**
 * Ohne bestätigten Hinweis gibt es keine Nutzung. Der PIN-Bereich braucht immer die PIN, die Einrichtung nur, wenn schon
 * eine Geometrie existiert (Ersteinrichtung ohne PIN). Ohne Geometrie kein Training; der Export bleibt nach PIN-Eingabe
 * zur Datenrettung erreichbar (ohne gespeicherte PIN wird dort zuerst eine festgelegt).
 * unlocked: PIN in dieser App-Sitzung eingegeben.
 */
export function resolveRoute(hash: string, s: Settings, unlocked: boolean): Route {
  if (!s.disclaimerAcceptedAt) return 'setup';
  const r = ROUTES[hash] ?? 'start';
  if (!unlocked && (ADMIN_ROUTES.has(r) || (r === 'setup' && s.geometry))) return 'pin';
  if (!s.geometry && r !== 'export') return 'setup';
  return r;
}

/** „Heute X von Y gefunden“: linke Durchgänge mit Reiz, abgebrochene zählen nicht. */
export function blockSummary(recs: readonly TrialRecord[]): { found: number; total: number } {
  const left = recs.filter((r) => r.kind === 'left' && r.outcome !== 'aborted');
  return { found: left.filter((r) => r.outcome === 'hit').length, total: left.length };
}
