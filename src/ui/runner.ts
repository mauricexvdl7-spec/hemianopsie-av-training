/**
 * Ablauf eines Durchgangs (Spec 6): Kreuz, Wartezeit, Reiz mit Hüllkurve, Antwortfenster.
 * Alle Abhängigkeiten werden injiziert, damit der Ablauf mit Fake-Uhr testbar ist.
 */
import { sigmaDegToPx, visualToPx, type Geometry } from '../core/geometry';
import { envelope, levelParams } from '../core/stimulus';
import { classifyResponse, effectiveWindowMs } from '../core/trial';
import type { TrialPlan, TrialRecord } from '../core/types';
import type { ResponseEvent } from '../io/input';

export interface DrawState {
  fixation: boolean;
  blob: { x: number; y: number; sigmaPx: number; contrast: number; gain: number } | null;
}

/** hidden: App im Hintergrund; resize: Fenstergröße geändert; stall: Bild stand still (z. B. Systemeinblendung). */
export type AbortReason = 'hidden' | 'resize' | 'stall';

export interface RunnerDeps {
  /** performance.now() */
  now(): number;
  /** requestAnimationFrame */
  frame(cb: (t: number) => void): void;
  draw(state: DrawState): void;
  /** Plant den Ton; Beginn bei t0Ms + plan.soaMs auf der now()-Zeitachse. Liefert, ob er wirklich geplant wurde. */
  scheduleSound(plan: TrialPlan, t0Ms: number): boolean;
  input: { arm(cb: (e: ResponseEvent) => void): void; disarm(): void };
  geometry(): Geometry;
  signals: { onAbort(cb: (reason: AbortReason) => void): () => void };
}

/** Vorlauf, mit dem der Ton vor seinem Beginn an die Audio-Uhr übergeben wird. */
const SOUND_LOOKAHEAD_MS = 150;
/** Größte erlaubte Lücke zwischen zwei Frames, solange Reiz oder Antwortfenster laufen. */
export const MAX_FRAME_GAP_MS = 150;

export function runTrial(plan: TrialPlan, deps: RunnerDeps, startedAtIso: string): Promise<TrialRecord> {
  return new Promise((resolve) => {
    const t0 = deps.now() + plan.waitMs;
    const stimEnd = t0 + 2 * plan.rampMs + plan.plateauMs;
    const windowEnd = Math.max(t0 + plan.responseWindowMs, stimEnd);

    let stim: { x: number; y: number; sigmaPx: number; contrast: number; sigmaDeg: number } | null = null;
    if (plan.kind !== 'catch' && plan.pos && plan.level !== null) {
      const g = deps.geometry();
      const { contrast, sigmaDeg } = levelParams(plan.level);
      const px = visualToPx(g, plan.pos);
      stim = { ...px, contrast, sigmaDeg, sigmaPx: sigmaDegToPx(g, plan.pos.eccDeg, sigmaDeg) };
    }

    let responseMs: number | null = null;
    let soundScheduled = false;
    let soundPlayed = false;
    let finished = false;
    let lastFrameMs = deps.now();

    const finish = (abortReason: AbortReason | null): void => {
      if (finished) return;
      finished = true;
      deps.input.disarm();
      unsubscribe();
      deps.draw({ fixation: true, blob: null });
      const rtMs = responseMs === null ? null : responseMs - t0;
      resolve({
        ...plan,
        startedAtIso,
        outcome: abortReason ? 'aborted' : classifyResponse(plan.kind, rtMs, effectiveWindowMs(plan)),
        rtMs: abortReason ? null : rtMs,
        contrast: stim?.contrast ?? null,
        sigmaDeg: stim?.sigmaDeg ?? null,
        stimulusPx: stim ? { x: stim.x, y: stim.y } : null,
        soundPlayed,
        fixationOk: null,
        abortReason,
        stairBefore: null,
        stairAfter: null,
      });
    };

    const unsubscribe = deps.signals.onAbort((reason) => finish(reason));

    // Antworten werden schon während der Wartezeit angenommen, damit Vorwegnahmen erkannt werden.
    deps.input.arm((e) => {
      responseMs = e.timeMs;
    });

    const tick = (): void => {
      if (finished) return;
      const now = deps.now();
      const prev = lastFrameMs;
      lastFrameMs = now;
      // Stand das Bild während Reiz oder Antwortfenster still, ist der Durchgang nicht auswertbar
      if (now - prev > MAX_FRAME_GAP_MS && now > t0 && prev < windowEnd) {
        finish('stall');
        return;
      }
      if (!soundScheduled && plan.sound !== 'none' && now >= t0 + plan.soaMs - SOUND_LOOKAHEAD_MS) {
        soundScheduled = true;
        soundPlayed = deps.scheduleSound(plan, t0) === true;
      }
      const gain = stim ? envelope(now - t0, plan.rampMs, plan.plateauMs) : 0;
      deps.draw({
        fixation: true,
        blob: stim && gain > 0 ? { x: stim.x, y: stim.y, sigmaPx: stim.sigmaPx, contrast: stim.contrast, gain } : null,
      });
      if ((responseMs !== null && now >= stimEnd) || now >= windowEnd) {
        finish(null);
        return;
      }
      deps.frame(tick);
    };

    deps.draw({ fixation: true, blob: null });
    deps.frame(tick);
  });
}
