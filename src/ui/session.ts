/** Ablauf mehrerer Durchgänge hintereinander und Hilfen für Sitzungen. */
import {
  beginSession,
  createControllerState,
  createSessionPlanner,
  endSession,
  type SessionPlanner,
} from '../core/controller';
import type { GridConfig } from '../core/blocks';
import { MAX_TRIALS_PER_SESSION } from '../core/schedule';
import type { Geometry } from '../core/geometry';
import type { Rng } from '../core/rng';
import type { TimingSettings } from '../core/timing';
import type { TrialPlan, TrialRecord } from '../core/types';
import type { Db, SessionRecord } from '../store/db';
import { runTrial, type RunnerDeps } from './runner';

/** Lokales Datum als YYYY-MM-DD (für das Tageslimit und Vergleiche mit gestern). */
export function dayKey(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Spielt Durchgänge ab und speichert jeden sofort. Bei einem Abbruch endet der Block mit den bisherigen Datensätzen. */
export async function runBlock(args: {
  db: Db;
  planner: { next(): TrialPlan };
  deps: RunnerDeps;
  sessionId: string;
  trials: number;
  nowIso(): string;
  onTrial?(r: TrialRecord): void;
  /** Wandelt den Datensatz um, bevor er gespeichert wird (z. B. `planner.apply`). */
  transform?(r: TrialRecord): TrialRecord;
  /** Wird vor jedem Durchgang gefragt; ist die Antwort wahr, endet der Block ohne weiteren Durchgang. */
  shouldStop?(): boolean;
}): Promise<TrialRecord[]> {
  const out: TrialRecord[] = [];
  for (let i = 0; i < args.trials; i++) {
    if (args.shouldStop?.()) break;
    const plan = args.planner.next();
    const raw = await runTrial(plan, args.deps, args.nowIso());
    const rec = args.transform ? args.transform(raw) : raw;
    await args.db.addTrial(rec);
    out.push(rec);
    args.onTrial?.(rec);
    if (rec.outcome === 'aborted') break;
  }
  return out;
}

/** Durchgänge einer Trainingssitzung ab Meilenstein 2. */
export const SESSION_TRIALS_M2 = 60;

export interface TrainingSessionArgs {
  db: Db;
  deps: RunnerDeps;
  geometry: Geometry;
  responseWindowMs: number;
  /** Tempo aus den Einstellungen; die Sitzung behält das Tempo, mit dem sie begonnen hat. */
  timing?: Partial<TimingSettings>;
  /**
   * Gewünschte Zahl gewerteter Durchgänge der ganzen Sitzung (abgebrochene zählen nicht).
   * Fehlt sie, läuft die Sitzung, bis `stopWhen` wahr ist; höchstens `MAX_TRIALS_PER_SESSION` gewertete Durchgänge.
   */
  trials?: number;
  /** Raster der Reizorte; Standard `DEFAULT_GRID`. */
  grid?: GridConfig;
  sessionId: string;
  now(): Date;
  onTrial?(r: TrialRecord): void;
  rng: Rng;
}

/**
 * Eine laufende Trainingssitzung. Der Aufrufer behält das Objekt zwischen Pausen derselben Sitzung:
 * `run` setzt mit demselben Planer fort, `finish` schließt die Sitzung ab (nur nach vollständigem Lauf).
 */
export interface TrainingSession {
  planner: SessionPlanner;
  session: SessionRecord;
  /** Alle bisher gespeicherten Datensätze dieser Sitzung (auch abgebrochene). */
  records: TrialRecord[];
  /**
   * Spielt die noch fehlenden Durchgänge ab. Bei Abbruch (`aborted: true`) ist der Zustand von Karte und Treppe
   * bereits gespeichert, die Sitzung aber nicht beendet; ein weiterer Aufruf macht mit demselben Planer weiter.
   * Zurückgegeben werden nur die Datensätze dieses Aufrufs. `stopWhen` wird vor jedem Durchgang gefragt.
   */
  run(deps: RunnerDeps, opts?: { stopWhen?(): boolean }): Promise<{ records: TrialRecord[]; aborted: boolean }>;
  /** Aktive Zeit in ms: Summe abgeschlossener Läufe plus laufender Lauf (Pausen zwischen den Läufen zählen nicht). */
  activeMs(): number;
  /** Sitzungsende: Phasenkriterium, Sitzungszähler, Controller, Karten-Snapshot und Sitzungsdatensatz. */
  finish(): Promise<void>;
}

/**
 * Schließt Trainingssitzungen, die nie beendet wurden (App geschlossen, Absturz): Ende = Beginn ihres letzten
 * Durchgangs, sonst ihr eigener Beginn. Es gibt keine Phasenbewertung (`summary` bleibt leer).
 */
async function closeOrphanSessions(db: Db, exceptId: string): Promise<void> {
  const open = (await db.listSessions()).filter((s) => s.kind === 'training' && s.endedAtIso === null && s.id !== exceptId);
  for (const s of open) {
    const last = (await db.listTrials(s.id)).map((t) => t.startedAtIso).sort().at(-1);
    await db.updateSession({ ...s, endedAtIso: last ?? s.startedAtIso });
  }
}

/**
 * Beginnt eine Sitzung: Controller laden oder anlegen, Vergessen anwenden (bei neuem Raster die alte Karte als
 * Snapshot `gridChanged` sichern), Sitzungsdatensatz anlegen, Planer erzeugen.
 */
export async function startTrainingSession(args: TrainingSessionArgs): Promise<TrainingSession> {
  const { db, geometry } = args;
  const startedAt = args.now();
  await closeOrphanSessions(db, args.sessionId);
  const stored = (await db.getController()) ?? createControllerState(geometry, args.grid);
  const { state, replacedMap } = beginSession(stored, geometry, args.grid);
  if (replacedMap) {
    await db.addMapSnapshot({
      id: `${args.sessionId}:gridChanged`,
      sessionId: args.sessionId,
      atIso: startedAt.toISOString(),
      gridSignature: stored.gridSignature,
      map: replacedMap,
      stage: stored.phase.stage,
      reason: 'gridChanged',
    });
  }
  const planner = createSessionPlanner(state, {
    rng: args.rng,
    geometry,
    sessionId: args.sessionId,
    responseWindowMs: args.responseWindowMs,
    timing: args.timing,
    grid: args.grid,
  });
  const session: SessionRecord = {
    id: args.sessionId,
    startedAtIso: startedAt.toISOString(),
    endedAtIso: null,
    dayKey: dayKey(startedAt),
    kind: 'training',
    trialCount: 0,
  };
  await db.addSession(session);
  const records: TrialRecord[] = [];
  // Nur die Zeit, in der ein Lauf wirklich spielt: Pausen zwischen den Läufen und Hintergrundzeit zählen nicht (Spec 9).
  let finishedMs = 0;
  let runStart: number | null = null;
  const activeMs = () => finishedMs + (runStart === null ? 0 : Math.max(0, args.now().getTime() - runStart));

  return {
    planner,
    session,
    records,
    activeMs,
    async run(deps, opts) {
      runStart = args.now().getTime();
      try {
        const done = records.filter((r) => r.outcome !== 'aborted').length;
        const target = Math.min(args.trials ?? MAX_TRIALS_PER_SESSION, MAX_TRIALS_PER_SESSION);
        const recs = await runBlock({
          db,
          planner,
          deps,
          sessionId: args.sessionId,
          trials: Math.max(0, target - done),
          shouldStop: opts?.stopWhen,
          nowIso: () => args.now().toISOString(),
          onTrial: args.onTrial,
          transform: (r) => planner.apply(r),
        });
        records.push(...recs);
        session.trialCount = records.length;
        const aborted = recs.at(-1)?.outcome === 'aborted';
        if (aborted) {
          // Fortschritt sichern, Sitzung bleibt offen.
          await db.saveController(planner.state());
          await db.updateSession(session);
        }
        return { records: recs, aborted };
      } finally {
        finishedMs += Math.max(0, args.now().getTime() - runStart);
        runStart = null;
      }
    },
    async finish() {
      const endedAt = args.now();
      const durationMin = finishedMs / 60000;
      const summary = planner.summary(durationMin);
      const ended = endSession(planner.state(), summary, endedAt.toISOString());
      await db.saveController(ended);
      await db.addMapSnapshot({
        id: `${args.sessionId}:sessionEnd`,
        sessionId: args.sessionId,
        atIso: endedAt.toISOString(),
        gridSignature: ended.gridSignature,
        map: ended.map,
        stage: summary.stage,
        reason: 'sessionEnd',
        guess: planner.state().guess,
      });
      session.endedAtIso = endedAt.toISOString();
      session.summary = summary;
      session.stage = summary.stage;
      await db.updateSession(session);
    },
  };
}

/** Eine ganze Sitzung am Stück: beginnen, abspielen, bei vollständigem Lauf abschließen (bei Abbruch nicht). */
export async function runTrainingSession(args: TrainingSessionArgs): Promise<{ records: TrialRecord[]; aborted: boolean }> {
  const ts = await startTrainingSession(args);
  const res = await ts.run(args.deps);
  if (!res.aborted) await ts.finish();
  return res;
}
