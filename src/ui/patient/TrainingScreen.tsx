/**
 * Training (Stand M3): Ablauf nach `flowReducer`.
 * Tageslimit prüfen → Begrüßung und Anleitung → Läufe mit Pause nach je 5 Minuten aktiver Zeit → Tagesrückmeldung.
 * Alles, was er wissen muss, wird gesagt und groß gezeigt. Ansagen und Durchgänge überlappen nie:
 * Ein Lauf beginnt erst, wenn die laufende Ansage beendet ist, und während eines Laufs wird nichts gesagt.
 * Die Sitzung lebt in einem Ref und überdauert Pausen innerhalb derselben App-Sitzung.
 */
import { useEffect, useReducer, useRef, useState } from 'preact/hooks';
import { createRng } from '../../core/rng';
import { clampSessionMinutes, dailyLimitReached, nextStep, PAUSE_MIN_MS } from '../../core/schedule';
import { DEFAULT_WINDOW_MS } from '../../core/trial';
import type { AudioEngine } from '../../io/audio';
import { textFor, type Voice } from '../../io/voice';
import type { Db, Settings } from '../../store/db';
import { planningGeometry } from '../browserDeps';
import { dayKey, newId, startTrainingSession, type TrainingSession } from '../session';
import { TrialStage } from '../TrialStage';
import { unlockAudio } from '../unlockAudio';
import { viewportMatches } from '../validate';
import { dailyFeedback, dayCounts, previousDayKey } from './dailyFeedback';
import { flowReducer, INITIAL_FLOW } from './flow';

/** Takt der Pausenuhr (ms). */
const PAUSE_TICK_MS = 500;
/** So lange nach dem Erscheinen von Rückmeldung oder Tageslimit wirkt Tippen nicht (Doppeltipp verschluckt sonst die Ansage). */
const TAP_GUARD_MS = 1000;

export function TrainingScreen(props: {
  db: Db;
  audio: AudioEngine;
  voice: Voice;
  settings: Settings;
  onExit(): void;
  /** Monotone Uhr in ms; Standard `performance.now`, nur für Tests ersetzbar. */
  now?: () => number;
}) {
  const { db, voice, settings } = props;
  const now = props.now ?? (() => performance.now());
  const geometry = settings.geometry!;
  const windowOk = () => viewportMatches(settings.setupViewport, window.innerWidth, window.innerHeight);
  const [state, dispatch] = useReducer(flowReducer, INITIAL_FLOW);
  const training = useRef<TrainingSession | null>(null);
  /** Aktive Zeit der Sitzung zu Beginn des laufenden 5-Minuten-Abschnitts. */
  const segStart = useRef(0);
  const alive = useRef(true);
  const pauseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Ende der zuletzt eingereihten Ansage; Ansagen laufen nacheinander, ein Lauf wartet darauf. */
  const speech = useRef<Promise<void>>(Promise.resolve());
  /** Wird bei `silence` erhöht: eingereihte, noch nicht begonnene Ansagen entfallen dann. */
  const speechGen = useRef(0);
  /** Zeitpunkt (`now`), zu dem Rückmeldung oder Tageslimit erschienen sind. */
  const shownAt = useRef(0);
  // Uhr der Pausenanzeige (Fortschrittsbalken); der Automat ändert sich vor Ablauf der 30 s nicht.
  const [clock, setClock] = useState(() => now());

  /** Ansagen nacheinander einreihen; erfüllt sich, wenn die letzte davon fertig ist. */
  const announce = (lines: Array<() => Promise<void>>): Promise<void> => {
    const gen = speechGen.current;
    const p = speech.current.then(async () => {
      for (const line of lines) {
        if (gen !== speechGen.current || !alive.current) return;
        await line().catch(() => undefined);
      }
    });
    speech.current = p;
    return p;
  };
  const silence = () => {
    speechGen.current++;
    voice.cancel();
  };
  const stopPauseTimer = () => {
    if (pauseTimer.current !== null) clearInterval(pauseTimer.current);
    pauseTimer.current = null;
  };
  /** Tippen auf Rückmeldung oder Tageslimit: erst nach `TAP_GUARD_MS` zurück zum Start. */
  const tapToExit = () => {
    if (now() - shownAt.current >= TAP_GUARD_MS) exit();
  };
  const exit = () => {
    alive.current = false;
    silence();
    stopPauseTimer();
    props.onExit();
  };

  // Drehen oder Fenstergröße ändern: neu zeichnen, damit der Hinweis der Pause stimmt und das Tippen wieder wirkt
  const [, setWindowTick] = useState(0);
  useEffect(() => {
    const onChange = () => setWindowTick((n) => n + 1);
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    return () => {
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      alive.current = false;
      silence();
      stopPauseTimer();
    };
  }, []);

  // Je Zustand genau einmal beim Eintritt (Schlüssel ändert sich nur beim Wechsel, nicht bei Ticks)
  const pause = state.kind === 'pause' ? state : null;
  const scheduledPauseKey = pause?.reason === 'scheduled' ? pause.sinceMs : null;
  const pauseWaitingKey = pause && !pause.ready ? pause.sinceMs : null;
  const pauseReadyKey = pause?.reason === 'scheduled' && pause.ready ? pause.sinceMs : null;

  useEffect(() => {
    if (state.kind === 'checking') {
      db.listSessions()
        .then((sessions) => {
          if (alive.current) dispatch({ type: 'checked', limitReached: dailyLimitReached(sessions, dayKey(new Date())) });
        })
        .catch(() => {
          // Ohne Speicher kein Training; nicht vor einem leeren Bildschirm sitzen lassen
          if (alive.current) exit();
        });
    } else if (state.kind === 'limit') {
      shownAt.current = now();
      void announce([() => voice.say('greeting'), () => voice.say('dailyLimit')]);
    } else if (state.kind === 'intro') {
      void announce([() => voice.say('greeting'), () => voice.say('instruction')]).then(() => {
        if (alive.current) dispatch({ type: 'introDone' });
      });
    } else if (state.kind === 'ending') {
      void (async () => {
        if (training.current) await training.current.finish();
        training.current = null;
        const sessions = await db.listSessions();
        const today = dayKey(new Date());
        const yesterday = previousDayKey(today);
        // Nur die Durchgänge der Trainingssitzungen von heute und gestern laden (Index), nie alle gespeicherten
        const ids = sessions.filter((s) => s.kind === 'training' && (s.dayKey === today || s.dayKey === yesterday)).map((s) => s.id);
        const trials = (await Promise.all(ids.map((id) => db.listTrials(id)))).flat();
        // Wie beim Tageslimit: nur begonnene Trainingssitzungen (mindestens ein Durchgang)
        const hadYesterday = sessions.some((s) => s.kind === 'training' && s.dayKey === yesterday && s.trialCount >= 1);
        return dailyFeedback(dayCounts(sessions, trials, today), hadYesterday ? dayCounts(sessions, trials, yesterday) : null);
      })().then(
        (feedback) => {
          if (alive.current) dispatch({ type: 'ended', feedback });
        },
        () => {
          if (alive.current) exit();
        },
      );
    } else if (state.kind === 'feedback') {
      shownAt.current = now();
      const fb = state.feedback;
      void announce([
        () => voice.say('end'),
        () => voice.speakText(fb.numbersText),
        () => (fb.follow.kind === 'yesterday' ? voice.speakText(fb.follow.text) : voice.say('encouragement')),
      ]);
    }
  }, [state.kind]);

  useEffect(() => {
    if (scheduledPauseKey !== null) void announce([() => voice.say('pauseStart')]);
  }, [scheduledPauseKey]);

  useEffect(() => {
    if (pauseWaitingKey === null) return;
    setClock(now());
    pauseTimer.current = setInterval(() => {
      const t = now();
      setClock(t);
      dispatch({ type: 'tick', nowMs: t });
    }, PAUSE_TICK_MS);
    return stopPauseTimer;
  }, [pauseWaitingKey]);

  useEffect(() => {
    if (pauseReadyKey !== null) void announce([() => voice.say('pauseReady')]);
  }, [pauseReadyKey]);

  if (state.kind === 'running') {
    const newSegment = state.newSegment;
    return (
      <TrialStage
        key={state.run}
        geometry={geometry}
        audio={props.audio}
        run={async (deps) => {
          // Nie in eine Ansage hinein: noch ausstehende Ansagen entfallen, die laufende wird abgewartet
          silence();
          await speech.current;
          // Nie im falschen Fenster (Hochformat, Split View): Positionen wären falsch, Karte und Treppe würden verfälscht.
          // Ein Fenster, das schon beim Start falsch ist, meldet die Bühne nicht (sie bricht nur bei einer Änderung ab).
          if (!windowOk()) {
            // Sollte hier ein neuer Abschnitt beginnen, beginnt er jetzt; sonst führte das nächste Weitermachen sofort in die Pause
            if (newSegment && training.current) segStart.current = training.current.activeMs();
            dispatch({ type: 'interrupted', nowMs: now() });
            return;
          }
          // Der Planer bleibt über Pausen hinweg derselbe; nur beim ersten Mal wird die Sitzung begonnen.
          training.current ??= await startTrainingSession({
            db,
            deps,
            // Planung (Raster, Kartensignatur) immer mit der Fenstergröße der Einrichtung, sonst setzt ein Unterschied von wenigen Pixeln die Karte zurück
            geometry: planningGeometry(geometry, settings.setupViewport),
            // Alte Einstellungen können ein Fenster unter der heutigen Untergrenze enthalten
            responseWindowMs: Math.max(settings.responseWindowMs ?? DEFAULT_WINDOW_MS, settings.timing.responseWindowMinMs),
            timing: settings.timing,
            grid: settings.grid,
            sessionId: newId(),
            now: () => new Date(),
            onTrial: (r) => {
              if (r.outcome === 'hit') props.audio.playChime();
            },
            rng: createRng(Date.now() >>> 0),
          });
          const ts = training.current;
          if (newSegment) segStart.current = ts.activeMs();
          const sessionMinutes = clampSessionMinutes(settings.sessionMinutes);
          const step = () =>
            nextStep({ activeMs: ts.activeMs(), segmentActiveMs: ts.activeMs() - segStart.current, sessionMinutes });
          const { aborted } = await ts.run(deps, { stopWhen: () => step() !== 'trial' });
          if (!alive.current) return;
          if (aborted) {
            dispatch({ type: 'interrupted', nowMs: now() });
            return;
          }
          // Endet der Lauf ohne fälligen Schritt (Schutzgrenze erreicht), ist die Sitzung zu Ende.
          const s = step();
          dispatch({ type: 'segmentDone', step: s === 'pause' ? 'pause' : 'end', nowMs: now() });
        }}
      />
    );
  }

  if (pause) {
    const ok = windowOk();
    const progress = pause.ready ? 1 : Math.min(1, Math.max(0, (clock - pause.sinceMs) / PAUSE_MIN_MS));
    return (
      <div
        class="patient screen overlay-message"
        onClick={() => {
          unlockAudio(props.audio);
          dispatch({ type: 'tap', nowMs: now(), windowOk: windowOk() });
        }}
      >
        <div class="patient-right">
          <div class="message-card card">
            {ok ? (
              <>
                <p class="message-text">{pause.reason === 'scheduled' ? 'Kurze Pause' : 'Pause'}</p>
                {pause.reason === 'scheduled' && (
                  <div class="pause-bar" role="img" aria-label="Pause läuft">
                    <div style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                )}
                {pause.ready && <p class="message-hint">Tippe zum Weitermachen.</p>}
              </>
            ) : (
              <p class="message-text">
                {window.innerWidth < window.innerHeight ? 'Bitte das iPad quer halten.' : 'Bitte die App im Vollbild verwenden.'}
              </p>
            )}
          </div>
          <button
            class="finish-button"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: 'finishToday' });
            }}
          >
            Fertig für heute
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'limit') {
    return (
      <div class="patient screen overlay-message" onClick={tapToExit}>
        <div class="patient-right">
          <div class="message-card card">
            <p class="message-text">{textFor('dailyLimit', settings.announcements)}</p>
            <p class="message-hint">Tippe, um zurückzugehen.</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === 'feedback') {
    const fb = state.feedback;
    return (
      <div class="patient screen summary" onClick={tapToExit}>
        <div class="patient-right">
          <div class="message-card card">
            <p class="summary-lead">Heute gefunden</p>
            <p class="summary-count">
              {fb.found} <span class="of">von</span> {fb.total}
            </p>
            <div class="summary-bar" role="img" aria-label={`${fb.found} von ${fb.total} gefunden`}>
              <div style={{ width: `${fb.total > 0 ? Math.round((100 * fb.found) / fb.total) : 0}%` }} />
            </div>
            <p class="summary-follow">
              {fb.follow.kind === 'yesterday' ? fb.follow.text : textFor('encouragement', settings.announcements)}
            </p>
            <p class="message-hint">Tippe, um zurückzugehen.</p>
          </div>
        </div>
      </div>
    );
  }

  // checking, intro, ending: leerer Patientenbildschirm
  return <div class="patient screen" />;
}
