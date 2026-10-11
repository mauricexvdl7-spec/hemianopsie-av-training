/**
 * Sitzungsplaner: setzt Schwellen-Karte, Ortswahl, Treppe und Phasenlogik zusammen.
 * Der Zustand ist reines JSON (wird später in IndexedDB abgelegt).
 */
import { RAMP_MS, REFERENCE_LEVEL } from './stimulus';
import { clampTiming, type TimingSettings } from './timing';
import { DEFAULT_GRID, gridPoints, jitterPosition, makeBlock, type GridConfig, type GridPoint } from './blocks';
import type { Geometry } from './geometry';
import { guessRate, updateGuessRate, type GuessRateState } from './guessRate';
import { DEFAULT_HALF_LIFE_SESSIONS, createMap, forgetMap, updateMap, type MapState } from './map';
import { assignSound, createPhaseState, evaluatePhase, type PhaseState, type SessionSummary } from './phases';
import type { Rng } from './rng';
import { checkTrialPlan } from './safety';
import { choosePoint, presentedLevel } from './selector';
import { REGIONS, createStairs, regionOf, updateStair, type StairSet } from './staircase';
import type { TrialKind, TrialPlan, TrialRecord, VisualPos } from './types';

export interface ControllerState {
  version: 1;
  gridSignature: string;
  map: MapState;
  stairs: StairSet;
  guess: GuessRateState;
  phase: PhaseState;
  halfLifeSessions: number;
  sessionCount: number;
  /** Eine Sitzung wurde begonnen und noch nicht beendet; fehlt in alten Zuständen (gilt als false). */
  openSession?: boolean;
}

/** Tiefe Kopie (der Zustand ist reines JSON). */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Kennung des Rasters: sortierte Punkt-IDs, mit '|' verbunden. */
export function gridSignature(points: GridPoint[]): string {
  return points
    .map((p) => p.id)
    .sort()
    .join('|');
}

/** Startzustand für die gegebene Geometrie: leere Karte, Treppen auf Stufe 6, Phase 1. */
export function createControllerState(g: Geometry, grid: GridConfig = DEFAULT_GRID): ControllerState {
  const points = gridPoints(g, 'L', grid);
  return {
    version: 1,
    gridSignature: gridSignature(points),
    map: createMap(points),
    stairs: createStairs(),
    guess: { falseAlarms: 0, catchTrials: 0 },
    phase: createPhaseState(),
    halfLifeSessions: DEFAULT_HALF_LIFE_SESSIONS,
    sessionCount: 0,
  };
}

/**
 * Neue Sitzung: Raster prüfen (bei anderer Signatur neue Karte, alte zurückgeben), Vergessen anwenden.
 * War die vorige Sitzung noch offen (nicht beendet), wird nicht noch einmal vergessen. Danach gilt die Sitzung als offen.
 */
export function beginSession(
  s: ControllerState,
  g: Geometry,
  grid: GridConfig = DEFAULT_GRID,
): { state: ControllerState; replacedMap: MapState | null } {
  const state = clone(s);
  const points = gridPoints(g, 'L', grid);
  const signature = gridSignature(points);
  state.openSession = true;
  if (signature !== state.gridSignature) {
    const replacedMap = state.map;
    state.map = createMap(points);
    state.gridSignature = signature;
    return { state, replacedMap };
  }
  if (s.openSession !== true) forgetMap(state.map, state.halfLifeSessions);
  return { state, replacedMap: null };
}

export interface SessionPlanner {
  next(): TrialPlan;
  /** Verarbeitet ein Ergebnis: Karte, Treppe, γ; ergänzt stairBefore/stairAfter. */
  apply(r: TrialRecord): TrialRecord;
  /** Summe für das Phasenkriterium (Dauer übergibt die UI). */
  summary(durationMin: number): SessionSummary;
  /** Aktueller Zustand (tiefe Kopie). */
  state(): ControllerState;
}

export interface SessionPlannerOptions {
  rng: Rng;
  geometry: Geometry;
  sessionId: string;
  responseWindowMs: number;
  /** Tempo (Plateau, Pause); Standard `DEFAULT_TIMING`, Werte werden geklemmt. Eine laufende Sitzung behält ihr Tempo. */
  timing?: Partial<TimingSettings>;
  /** Raster der Reizorte (rechte Seite); Standard `DEFAULT_GRID`. */
  grid?: GridConfig;
}

/** Planer für eine Sitzung; arbeitet auf einer eigenen Kopie des Zustands. */
export function createSessionPlanner(s: ControllerState, opts: SessionPlannerOptions): SessionPlanner {
  const st = clone(s);
  const { rng, geometry } = opts;
  const timing = clampTiming(opts.timing ?? {});
  const rightGrid = gridPoints(geometry, 'R', opts.grid ?? DEFAULT_GRID);
  let queue: TrialKind[] = [];
  let index = 0;
  let lastLeft: number | null = null;
  // Zähler der Treppen-Durchgänge dieser Sitzung (für summary).
  let levelSum = 0;
  let stairTrials = 0;
  let hits = 0;

  return {
    next(): TrialPlan {
      if (queue.length === 0) queue = makeBlock(rng);
      const kind = queue.shift()!;
      let pos: VisualPos | null = null;
      let gridPointId: string | null = null;
      let level: number | null = null;
      if (kind === 'left') {
        const i = choosePoint(st.map, st.stairs, guessRate(st.guess), rng, lastLeft);
        const gp = st.map.points[i]!;
        lastLeft = i;
        level = presentedLevel(st.map, st.stairs, i, guessRate(st.guess));
        pos = jitterPosition(rng, geometry, gp.pos);
        gridPointId = gp.id;
      } else if (kind === 'right') {
        if (rightGrid.length === 0) throw new Error('Kein Rasterpunkt passt auf den Bildschirm. Geometrie prüfen.');
        const gp = rightGrid[rng.int(rightGrid.length)]!;
        level = REFERENCE_LEVEL;
        pos = jitterPosition(rng, geometry, gp.pos);
        gridPointId = gp.id;
      }
      const snd = assignSound(st.phase.stage, kind, rng);
      const plan: TrialPlan = {
        id: `${opts.sessionId}-${index}`,
        sessionId: opts.sessionId,
        index,
        kind,
        pos,
        gridPointId,
        level,
        sound: snd.sound,
        soaMs: snd.soaMs,
        soundGainDb: snd.soundGainDb,
        // Der Ton darf bis zu 300 ms vor dem Licht beginnen; die Wartezeit zählt bis zum ersten Reiz (Ton oder Licht).
        waitMs: rng.uniform(timing.waitMinMs, timing.waitMaxMs) - Math.min(0, snd.soaMs),
        rampMs: RAMP_MS,
        plateauMs: timing.plateauMs,
        responseWindowMs: opts.responseWindowMs,
        phase: st.phase.stage,
      };
      const errors = checkTrialPlan(plan);
      if (errors.length > 0) throw new Error(`Unsicherer Reizplan: ${errors.join(' ')}`);
      index++;
      return plan;
    },

    apply(r: TrialRecord): TrialRecord {
      const unchanged: TrialRecord = { ...r, stairBefore: null, stairAfter: null };
      if (r.outcome !== 'hit' && r.outcome !== 'miss') {
        if (r.kind === 'catch' && (r.outcome === 'falseAlarm' || r.outcome === 'correctRejection')) {
          st.guess = updateGuessRate(st.guess, r.outcome === 'falseAlarm');
        }
        return unchanged;
      }
      if (r.kind !== 'left' || r.pos === null || r.level === null) return unchanged;

      const hit = r.outcome === 'hit';
      updateMap(st.map, { pos: r.pos, level: r.level, hit }, guessRate(st.guess));
      if (r.sound === 'wrongSide') return unchanged;

      // Region des Rasterpunkts, dessen Treppe die Stufe geliefert hat (nicht der verschobenen Position).
      const gp = st.map.points.find((p) => p.id === r.gridPointId);
      const region = regionOf((gp?.pos ?? r.pos).angleDeg);
      const before = st.stairs[region];
      const after = updateStair(before, hit);
      st.stairs[region] = after;
      levelSum += r.level; // dargebotene Stufe = benötigte Reizstärke (Spec 9)
      stairTrials++;
      if (hit) hits++;
      return { ...r, stairBefore: before.level, stairAfter: after.level };
    },

    summary(durationMin: number): SessionSummary {
      const meanLeftLevel =
        stairTrials > 0 ? levelSum / stairTrials : REGIONS.reduce((a, k) => a + st.stairs[k].level, 0) / REGIONS.length;
      return {
        stage: st.phase.stage,
        durationMin,
        meanLeftLevel,
        leftHitRate: stairTrials > 0 ? hits / stairTrials : 0,
      };
    },

    state(): ControllerState {
      return clone(st);
    },
  };
}

/** Sitzungsende: Phasenkriterium auswerten, Sitzungszähler erhöhen, Sitzung schließen. */
export function endSession(s: ControllerState, summary: SessionSummary, atIso: string): ControllerState {
  return {
    ...clone(s),
    phase: evaluatePhase(clone(s.phase), summary, atIso),
    sessionCount: s.sessionCount + 1,
    openSession: false,
  };
}
