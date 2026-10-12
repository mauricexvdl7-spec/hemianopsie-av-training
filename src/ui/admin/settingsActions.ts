/** Reine Hilfen und Laden für die Einstellungsseite: Werte begrenzen, Phase von Hand setzen, Controller anlegen. */
import { clampGrid, type GridConfig } from '../../core/blocks';
import { createControllerState, type ControllerState } from '../../core/controller';
import { setStageManually, type Stage } from '../../core/phases';
import { clampSessionMinutes } from '../../core/schedule';
import type { Db, Settings } from '../../store/db';
import { planningGeometry } from '../browserDeps';

/** Halbwertszeit des Vergessens in Sitzungen. */
export const HALF_LIFE_LIMITS = { min: 3, max: 20 } as const;

export function applySessionMinutes(s: Settings, minutes: number): Settings {
  return { ...s, sessionMinutes: clampSessionMinutes(minutes) };
}

/** Übernimmt einzelne Rasterwerte (geklemmt); nicht genannte Felder bleiben. */
export function applyGrid(s: Settings, grid: Partial<GridConfig>): Settings {
  return { ...s, grid: clampGrid({ ...s.grid, ...grid }) };
}

/** Setzt die Phase von Hand (Eintrag im Verlauf); der Eingang bleibt unverändert. */
export function withManualStage(c: ControllerState, stage: Stage, atIso: string): ControllerState {
  return { ...c, phase: setStageManually(c.phase, stage, atIso) };
}

/** Halbwertszeit in Sitzungen: gerundet, begrenzt auf 3..20; ungültige Eingaben ändern nichts. */
export function withHalfLife(c: ControllerState, sessions: number): ControllerState {
  if (!Number.isFinite(sessions)) return c;
  return { ...c, halfLifeSessions: Math.min(HALF_LIFE_LIMITS.max, Math.max(HALF_LIFE_LIMITS.min, Math.round(sessions))) };
}

/** Gespeicherter Controller oder neu angelegt aus den Einstellungen (Geometrie der Einrichtung, Raster); null ohne Geometrie. */
export async function loadOrCreateController(db: Db, s: Settings): Promise<ControllerState | null> {
  const stored = await db.getController();
  if (stored) return stored;
  if (!s.geometry) return null;
  return createControllerState(planningGeometry(s.geometry, s.setupViewport), s.grid);
}
