import type { Rng } from './rng';
import type { SoundCondition, TrialKind } from './types';

export type Stage = '1' | '2' | '3a' | '3b' | '3c' | '4a' | '4b' | '4c' | '5';

/** Phasenstufen in aufsteigender Reihenfolge. */
export const STAGES: readonly Stage[] = ['1', '2', '3a', '3b', '3c', '4a', '4b', '4c', '5'];

/** Anteil linker Durchgänge ohne Ton (Phase 1–3). */
export const LIGHT_ONLY_SHARE = 0.1;
/** Anteil linker Durchgänge mit Falsch-Ton (ab Phase 2). */
export const WRONG_SIDE_SHARE = 0.1;

export interface SoundAssignment {
  sound: SoundCondition;
  soaMs: number;
  soundGainDb: number;
}

const NONE: SoundAssignment = { sound: 'none', soaMs: 0, soundGainDb: 0 };

const LEAD_GAIN_DB: Partial<Record<Stage, number>> = {
  '2': 0,
  '3a': -6,
  '3b': -12,
  '3c': -18,
  '4a': -18,
  '4b': -18,
  '4c': -18,
};

/** Tonanteil q der Phase 4. */
const TONE_SHARE: Partial<Record<Stage, number>> = { '4a': 0.75, '4b': 0.5, '4c': 0.25 };

function toneWithSoa(sound: 'lead' | 'wrongSide', gainDb: number, rng: Rng): SoundAssignment {
  return { sound, soaMs: -rng.uniform(100, 300), soundGainDb: gainDb };
}

/** Wählt Tonbedingung, SOA und Pegel für einen Durchgang der gegebenen Stufe. */
export function assignSound(stage: Stage, kind: TrialKind, rng: Rng): SoundAssignment {
  if (kind === 'catch' || stage === '5') return NONE;
  const left = kind === 'left';

  if (stage === '1') {
    if (left && rng.next() < LIGHT_ONLY_SHARE) return NONE;
    return { sound: 'sync', soaMs: 0, soundGainDb: 0 };
  }

  const gain = LEAD_GAIN_DB[stage] ?? 0;
  const q = TONE_SHARE[stage];
  if (q === undefined) {
    // Stufe 2 und 3x: Dreiteilung links, rechts immer lead.
    if (!left) return toneWithSoa('lead', gain, rng);
    const r = rng.next();
    if (r < LIGHT_ONLY_SHARE) return NONE;
    if (r < LIGHT_ONLY_SHARE + WRONG_SIDE_SHARE) return toneWithSoa('wrongSide', gain, rng);
    return toneWithSoa('lead', gain, rng);
  }

  // Stufe 4x: erst Tonanteil q, dann Falsch-Ton unter den Tondurchgängen.
  if (rng.next() >= q) return NONE;
  if (left && rng.next() < WRONG_SIDE_SHARE) return toneWithSoa('wrongSide', gain, rng);
  return toneWithSoa('lead', gain, rng);
}

export interface SessionSummary {
  stage: Stage;
  durationMin: number;
  meanLeftLevel: number;
  /** Ohne Falsch-Ton, ohne Vorwegnahme/Abbruch. */
  leftHitRate: number;
}

export interface PhaseState {
  stage: Stage;
  sessionsInStage: number;
  levelBeforeChange: number | null;
  sessionsSinceChange: number;
  lockSessions: number;
  /** Nur die aktuelle Stufe. */
  history: SessionSummary[];
  log: Array<{ atIso: string; from: Stage; to: Stage; reason: 'advance' | 'regress' | 'manual' }>;
}

/** Kürzere Sitzungen zählen für das Wechselkriterium nicht. */
export const MIN_SESSION_MIN = 10;

const REGRESS_MARGIN = 2.0;
const LOCK_AFTER_REGRESS = 3;
const STABLE_SPREAD = 1.0;
const MIN_HIT_RATE = 0.6;

/** Startzustand: Stufe 1. */
export function createPhaseState(): PhaseState {
  return {
    stage: '1',
    sessionsInStage: 0,
    levelBeforeChange: null,
    sessionsSinceChange: 0,
    lockSessions: 0,
    history: [],
    log: [],
  };
}

function stageAt(i: number): Stage {
  return STAGES[Math.min(Math.max(i, 0), STAGES.length - 1)]!;
}

/** Wertet eine Sitzung aus und entscheidet über Stufenwechsel oder Rückschritt (rein). */
export function evaluatePhase(s: PhaseState, summary: SessionSummary, atIso: string): PhaseState {
  if (summary.durationMin < MIN_SESSION_MIN) return s;

  let next: PhaseState = {
    ...s,
    history: [...s.history, summary],
    sessionsInStage: s.sessionsInStage + 1,
    sessionsSinceChange: s.sessionsSinceChange + 1,
    lockSessions: Math.max(0, s.lockSessions - 1),
  };
  const idx = STAGES.indexOf(next.stage);
  const last3 = next.history.slice(-3);

  // Rückschritt
  if (next.stage !== '1' && next.levelBeforeChange !== null && last3.length === 3) {
    const limit = next.levelBeforeChange + REGRESS_MARGIN;
    if (last3.every((h) => h.meanLeftLevel > limit)) {
      const to = stageAt(idx - 1);
      return {
        ...next,
        stage: to,
        lockSessions: LOCK_AFTER_REGRESS,
        levelBeforeChange: null,
        history: [],
        sessionsInStage: 0,
        log: [...next.log, { atIso, from: next.stage, to, reason: 'regress' }],
      };
    }
  }

  // Wechsel
  if (next.stage !== '5' && next.lockSessions === 0 && last3.length === 3) {
    const needed = next.stage === '1' ? 5 : 3;
    if (next.sessionsInStage >= needed) {
      const levels = last3.map((h) => h.meanLeftLevel);
      const spread = Math.max(...levels) - Math.min(...levels);
      const stable = spread <= STABLE_SPREAD && levels[2]! <= levels[0]!;
      if (stable && last3.every((h) => h.leftHitRate >= MIN_HIT_RATE)) {
        const to = stageAt(idx + 1);
        next = {
          ...next,
          stage: to,
          levelBeforeChange: levels.reduce((a, b) => a + b, 0) / 3,
          history: [],
          sessionsInStage: 0,
          sessionsSinceChange: 0,
          log: [...next.log, { atIso, from: next.stage, to, reason: 'advance' }],
        };
      }
    }
  }
  return next;
}

/** Setzt die Stufe von Hand (z. B. durch die Therapeutin); Zähler und Sperre werden zurückgesetzt. */
export function setStageManually(s: PhaseState, stage: Stage, atIso: string): PhaseState {
  return {
    ...s,
    stage,
    history: [],
    sessionsInStage: 0,
    levelBeforeChange: null,
    sessionsSinceChange: 0,
    lockSessions: 0,
    log: [...s.log, { atIso, from: s.stage, to: stage, reason: 'manual' }],
  };
}
