import { useState } from 'preact/hooks';
import { createBasicPlanner } from '../../../core/blocks';
import type { GeometryInput } from '../../../core/geometry';
import { createRng } from '../../../core/rng';
import { DEFAULT_TIMING, clampTiming, type TimingSettings } from '../../../core/timing';
import { DEFAULT_WINDOW_MS, responseWindowFromReference } from '../../../core/trial';
import type { AudioEngine } from '../../../io/audio';
import type { Db } from '../../../store/db';
import { currentGeometry } from '../../browserDeps';
import { dayKey, newId, runBlock } from '../../session';
import { TrialStage } from '../../TrialStage';

export const REFERENCE_TRIALS = 20;

type State = { phase: 'intro' } | { phase: 'running' } | { phase: 'done'; rts: number[]; windowMs: number } | { phase: 'aborted' };

export function ReferenceStep(props: {
  db: Db;
  audio: AudioEngine;
  geometry: GeometryInput;
  /** Tempo aus den Einstellungen: die Referenz misst mit derselben Lichtdauer wie das Training. */
  timing?: TimingSettings;
  onNext(result: { referenceRtsMs: number[]; responseWindowMs: number }): void;
}) {
  const [state, setState] = useState<State>({ phase: 'intro' });
  const timing = clampTiming(props.timing ?? DEFAULT_TIMING);

  if (state.phase === 'running') {
    return (
      <TrialStage
        geometry={props.geometry}
        audio={props.audio}
        run={async (deps) => {
          const sessionId = `ref-${newId()}`;
          const now = new Date();
          await props.db.addSession({ id: sessionId, startedAtIso: now.toISOString(), endedAtIso: null, dayKey: dayKey(now), kind: 'reference', trialCount: 0 });
          const base = createBasicPlanner(createRng(Date.now() >>> 0), {
            sessionId,
            geometry: currentGeometry(props.geometry),
            responseWindowMs: Math.max(DEFAULT_WINDOW_MS, timing.responseWindowMinMs),
            onlyKind: 'right',
            timing,
          });
          // Referenz misst das Sehen: ohne Ton
          const planner = { next: () => ({ ...base.next(), sound: 'none' as const }) };
          const recs = await runBlock({ db: props.db, planner, deps, sessionId, trials: REFERENCE_TRIALS, nowIso: () => new Date().toISOString() });
          await props.db.updateSession({
            id: sessionId,
            startedAtIso: now.toISOString(),
            endedAtIso: new Date().toISOString(),
            dayKey: dayKey(now),
            kind: 'reference',
            trialCount: recs.length,
          });
          if (recs.some((r) => r.outcome === 'aborted')) {
            setState({ phase: 'aborted' });
            return;
          }
          const rts = recs.filter((r) => r.outcome === 'hit').map((r) => r.rtMs!);
          setState({ phase: 'done', rts, windowMs: responseWindowFromReference(rts, timing.responseWindowMinMs) });
        }}
      />
    );
  }

  return (
    <div>
      <h1>Reaktionszeit rechts</h1>
      {state.phase === 'intro' && (
        <>
          <p>
            Sag ihm: „Schau auf das Kreuz und tippe, sobald rechts ein Licht erscheint.“ Es folgen {REFERENCE_TRIALS} kurze Durchgänge ohne
            Ton, etwa zwei Minuten.
          </p>
          <button class="primary" onClick={() => setState({ phase: 'running' })}>
            Starten
          </button>
        </>
      )}
      {state.phase === 'aborted' && (
        <>
          <p class="error">Abgebrochen (App verlassen oder iPad gedreht). Bitte noch einmal.</p>
          <button class="primary" onClick={() => setState({ phase: 'running' })}>
            Noch einmal
          </button>
        </>
      )}
      {state.phase === 'done' && (
        <>
          <p>
            {state.rts.length} von {REFERENCE_TRIALS} Lichtern gesehen.
            {state.rts.length >= 5
              ? ` Mittlere Reaktionszeit ${Math.round([...state.rts].sort((a, b) => a - b)[state.rts.length >> 1]!)} ms.`
              : ' Zu wenige Treffer für eine eigene Messung, es gilt der Standardwert.'}{' '}
            Antwortfenster: {state.windowMs} ms.
          </p>
          <button onClick={() => setState({ phase: 'running' })}>Wiederholen</button>
          <button class="primary" onClick={() => props.onNext({ referenceRtsMs: state.rts, responseWindowMs: state.windowMs })}>
            Weiter
          </button>
        </>
      )}
    </div>
  );
}
