/**
 * Simulierter Proband mit linksseitigem Gesichtsfeldausfall (nur für Tests und Abnahme, nicht in der App).
 * Er treibt den echten Sitzungsplaner an: wahre Schwellen-Karte mit Grenzzone, Lernen und Toneffekt.
 */
import { angularDistanceDeg, type Geometry } from './geometry';
import {
  beginSession,
  createSessionPlanner,
  endSession,
  type ControllerState,
} from './controller';
import { guessRate } from './guessRate';
import { summarizePoint } from './map';
import type { Rng } from './rng';
import { REFERENCE_LEVEL, levelParams } from './stimulus';
import { DEFAULT_WINDOW_MS, classifyResponse } from './trial';
import type { SoundCondition, TrialPlan, TrialRecord, VisualPos } from './types';

export interface SimOptions {
  learning: boolean;
  /** Rate-Wahrscheinlichkeit (Standard 0,04). */
  gamma?: number;
  /** Eigene Fehlerrate bei sichtbaren Reizen (Standard 0,03). */
  lapse?: number;
}

export const SIM_GAMMA = 0.04;
export const SIM_LAPSE = 0.03;
/** Sitzungen, bis das Lernen voll wirkt. */
export const SIM_LEARNING_SESSIONS = 30;
/** Maximale Lernverbesserung in Stufen. */
export const SIM_LEARNING_GAIN = 2;
/** Ton senkt die Schwelle in der Grenzzone um eine Stufe. */
export const SIM_TONE_GAIN = 1;
const SIM_RT_MEDIAN_MS = 450;
const SIM_RT_SIGMA_LOG = 0.25;
const SIM_RT_MIN_MS = 160;
const ISLAND_CENTER: VisualPos = { side: 'L', eccDeg: 13, angleDeg: -45 };
const ISLAND_RADIUS_DEG = 3;
const ISLAND_BASE = 7;
const RAD = Math.PI / 180;

/** Wahre Basisschwelle ohne Lernen und ohne Ton. */
function baseThreshold(pos: VisualPos): number {
  const t = Math.tan(pos.eccDeg * RAD);
  const sign = pos.side === 'L' ? 1 : -1;
  const x = sign * Math.atan(t * Math.cos(pos.angleDeg * RAD)) / RAD;
  const y = Math.atan(t * Math.sin(pos.angleDeg * RAD)) / RAD;
  const xs = x - 0.1 * y;
  let base = 2 + 12 / (1 + Math.exp(-(xs - 4) / 1.2));
  if (angularDistanceDeg(pos, ISLAND_CENTER) < ISLAND_RADIUS_DEG) base = Math.min(base, ISLAND_BASE);
  return base;
}

function inBorder(base: number): boolean {
  return base > 4 && base < 12;
}

/** Wahre Schwelle (Stufen) am Ort, ohne Ton; `sessionIndex` steuert das Lernen (nur in der Grenzzone). */
export function trueThreshold(pos: VisualPos, sessionIndex: number, opts: SimOptions): number {
  const base = baseThreshold(pos);
  if (opts.learning && inBorder(base)) return base - SIM_LEARNING_GAIN * Math.min(1, sessionIndex / SIM_LEARNING_SESSIONS);
  return base;
}

/** Grenzzone: wahre Basisschwelle (ohne Lernen) zwischen 4 und 12. */
export function isBorderZone(pos: VisualPos): boolean {
  return inBorder(baseThreshold(pos));
}

/** Wirksame Schwelle unter Tonbedingung: Ton (gleichzeitig oder vorher) senkt sie nur in der Grenzzone. */
export function effectiveThreshold(pos: VisualPos, sound: SoundCondition, sessionIndex: number, opts: SimOptions): number {
  const theta = trueThreshold(pos, sessionIndex, opts);
  return (sound === 'sync' || sound === 'lead') && isBorderZone(pos) ? theta - SIM_TONE_GAIN : theta;
}

/** Trefferwahrscheinlichkeit des Probanden: γ + (1 − γ − Fehlerrate) · logistisch. */
export function subjectHitProbability(level: number, theta: number, opts: SimOptions): number {
  const gamma = opts.gamma ?? SIM_GAMMA;
  const lapse = opts.lapse ?? SIM_LAPSE;
  return gamma + (1 - gamma - lapse) / (1 + Math.exp(-(level - theta)));
}

function standardNormal(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
}

/** Antwort auf einen Plan; rtMs relativ zu t0, null = keine Antwort. */
export function simulateResponse(plan: TrialPlan, sessionIndex: number, rng: Rng, opts: SimOptions): { rtMs: number | null } {
  const gamma = opts.gamma ?? SIM_GAMMA;
  if (plan.pos === null || plan.level === null) {
    return { rtMs: rng.next() < gamma ? rng.uniform(200, 1500) : null };
  }
  const theta = effectiveThreshold(plan.pos, plan.sound, sessionIndex, opts);
  if (rng.next() >= subjectHitProbability(plan.level, theta, opts)) return { rtMs: null };
  const rt = SIM_RT_MEDIAN_MS * Math.exp(SIM_RT_SIGMA_LOG * standardNormal(rng));
  return { rtMs: Math.max(SIM_RT_MIN_MS, rt) };
}

/** Eine Sitzung mit dem echten Planer: Zustand und Datensätze (ohne UI). */
export function runSimulatedSession(
  state: ControllerState,
  g: Geometry,
  sessionIndex: number,
  trials: number,
  rng: Rng,
  opts: SimOptions,
): { state: ControllerState; records: TrialRecord[] } {
  const atIso = new Date(Date.UTC(2026, 0, 1 + sessionIndex)).toISOString();
  const begun = beginSession(state, g).state;
  const planner = createSessionPlanner(begun, {
    rng,
    geometry: g,
    sessionId: `sim-${sessionIndex}`,
    responseWindowMs: DEFAULT_WINDOW_MS,
  });
  const records: TrialRecord[] = [];
  for (let i = 0; i < trials; i++) {
    const plan = planner.next();
    const { rtMs } = simulateResponse(plan, sessionIndex, rng, opts);
    const params = plan.level === null ? null : levelParams(plan.level);
    const record: TrialRecord = {
      ...plan,
      startedAtIso: atIso,
      outcome: classifyResponse(plan.kind, rtMs, plan.responseWindowMs),
      rtMs,
      contrast: params ? params.contrast : null,
      sigmaDeg: params ? params.sigmaDeg : null,
      stimulusPx: null,
      soundPlayed: plan.sound !== 'none',
      fixationOk: null,
      abortReason: null,
      stairBefore: null,
      stairAfter: null,
    };
    records.push(planner.apply(record));
  }
  const next = endSession(planner.state(), planner.summary((trials * 4.5) / 60), atIso);
  return { state: next, records };
}

/** Der Schwellenfehler zählt nur an Orten, die mit irgendeiner Stufe sichtbar sind (wahre Schwelle ≤ 11). */
export const RMSE_MAX_TRUE_THETA = 11;

/**
 * RMSE zwischen geschätzter Schwelle (θ̂-Mittel der Karte) und wahrer Schwelle an der nominalen Rasterposition
 * (ohne Ton, mit dem Lernstand der Sitzung `sessionIndex`) über alle Punkte mit wahrer Schwelle ≤ 11.
 */
export function thresholdRmse(state: ControllerState, sessionIndex: number, opts: SimOptions): { rmse: number | null; points: number } {
  const gamma = guessRate(state.guess);
  let sum = 0;
  let n = 0;
  state.map.points.forEach((pt, i) => {
    const truth = trueThreshold(pt.pos, sessionIndex, opts);
    if (truth > RMSE_MAX_TRUE_THETA) return;
    sum += (summarizePoint(state.map, i, REFERENCE_LEVEL, gamma).thetaMean - truth) ** 2;
    n++;
  });
  return { rmse: n > 0 ? Math.sqrt(sum / n) : null, points: n };
}
