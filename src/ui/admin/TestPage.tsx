/** Testseite: einzelne Reize zeigen (Spec 12), gespeicherte Schwellen-Karte ansehen, Simulation ausprobieren. */
import { useEffect, useState } from 'preact/hooks';
import type { ControllerState } from '../../core/controller';
import { LEVEL_COUNT, RAMP_MS, levelParams } from '../../core/stimulus';
import type { Side, SoundCondition, TrialRecord } from '../../core/types';
import { checkTrialPlan } from '../../core/safety';
import { DEFAULT_WINDOW_MS } from '../../core/trial';
import type { AudioEngine } from '../../io/audio';
import type { Db, Settings } from '../../store/db';
import { currentGeometry } from '../browserDeps';
import { runTrial } from '../runner';
import { TrialStage } from '../TrialStage';
import { MapModeToggle, MapView, cellsFromMap, type MapMode } from './MapView';
import { SIM_SESSIONS, SIM_TRIALS_PER_SESSION, simulateMap, type SimulationResult } from './simulation';

export function TestPage(props: { db: Db; audio: AudioEngine; settings: Settings }) {
  const [level, setLevel] = useState(6);
  const [side, setSide] = useState<Side>('L');
  const [ecc, setEcc] = useState(8);
  const [angle, setAngle] = useState(0);
  const [sound, setSound] = useState<SoundCondition>('sync');
  const [running, setRunning] = useState(0);
  const [result, setResult] = useState<TrialRecord | null>(null);
  // undefined = lädt, null = noch keine Karte gespeichert
  const [controller, setController] = useState<ControllerState | null | undefined>(undefined);
  const [mode, setMode] = useState<MapMode>('prob');
  const [sim, setSim] = useState<SimulationResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    props.db
      .getController()
      .then((c) => alive && setController(c))
      .catch(() => alive && setController(null));
    return () => {
      alive = false;
    };
  }, [props.db]);
  const p = levelParams(level);

  const plan = {
    id: `test-${running}`,
    sessionId: 'test',
    index: running,
    kind: side === 'L' ? ('left' as const) : ('right' as const),
    pos: { side, eccDeg: ecc, angleDeg: angle },
    gridPointId: null,
    level,
    sound,
    soaMs: 0,
    soundGainDb: 0,
    waitMs: 1000,
    rampMs: RAMP_MS,
    plateauMs: props.settings.timing.plateauMs,
    responseWindowMs: Math.max(DEFAULT_WINDOW_MS, props.settings.timing.responseWindowMinMs),
    phase: 'test',
  };
  const errors = checkTrialPlan(plan);

  if (running > 0) {
    return (
      <TrialStage
        key={running}
        geometry={props.settings.geometry!}
        audio={props.audio}
        run={async (deps) => {
          const r = await runTrial(plan, deps, new Date().toISOString());
          setResult(r);
          setRunning(0);
        }}
      />
    );
  }

  return (
    <div class="admin screen">
      <div class="admin-inner">
        <section class="card">
          <h1>Testseite</h1>
          <label>
            Stufe {level} (Kontrast {p.contrast.toFixed(2)}, σ {p.sigmaDeg.toFixed(2)}°)
            <br />
            <input type="range" min={0} max={LEVEL_COUNT - 1} step={1} value={level} onInput={(e) => setLevel(Number(e.currentTarget.value))} />
          </label>
          <label>
            Seite:{' '}
            <select value={side} onChange={(e) => setSide(e.currentTarget.value as Side)}>
              <option value="L">links</option>
              <option value="R">rechts</option>
            </select>
          </label>
          <label>
            Exzentrizität {ecc}°
            <br />
            <input type="range" min={1} max={40} step={1} value={ecc} onInput={(e) => setEcc(Number(e.currentTarget.value))} />
          </label>
          <label>
            Winkel {angle}° (+90 oben, −90 unten)
            <br />
            <input type="range" min={-90} max={90} step={15} value={angle} onInput={(e) => setAngle(Number(e.currentTarget.value))} />
          </label>
          <label>
            Ton:{' '}
            <select value={sound} onChange={(e) => setSound(e.currentTarget.value as SoundCondition)}>
              <option value="none">keiner</option>
              <option value="sync">gleichzeitig</option>
            </select>
          </label>
          {errors.length > 0 && <p class="error">{errors.join(' ')}</p>}
          <div class="actions">
            <button
              class="primary"
              disabled={errors.length > 0}
              onClick={async () => {
                await props.audio.ensureRunning();
                props.audio.apply(props.settings.audio);
                setRunning(Date.now());
              }}
            >
              Reiz zeigen
            </button>
            <button onClick={() => (location.hash = '#/export')}>Zurück</button>
          </div>
          {result && (
            <p class="result-line">
              Ergebnis: {result.outcome}
              {result.rtMs !== null ? `, Reaktionszeit ${Math.round(result.rtMs)} ms` : ''}
            </p>
          )}
        </section>

        <section class="card">
          <h2>Karte</h2>
          {controller === undefined && <p class="hint">Wird geladen …</p>}
          {controller === null && <p class="hint">Noch keine Karte gespeichert. Sie entsteht beim Training.</p>}
          {controller && (
            <>
              <p class="hint">
                Gespeicherter Stand nach {controller.sessionCount} {controller.sessionCount === 1 ? 'Sitzung' : 'Sitzungen'}, Trainingsstufe{' '}
                {controller.phase.stage}. Die Testseite ändert die Karte nicht.
              </p>
              <MapModeToggle mode={mode} onChange={setMode} />
              <MapView title="Gespeicherte Karte" cells={cellsFromMap(controller.map, controller.guess)} mode={mode} />
            </>
          )}
        </section>

        <section class="card">
          <h2>Simulation</h2>
          <p class="hint">
            Ein simulierter Proband mit linksseitigem Ausfall durchläuft {SIM_SESSIONS} Sitzungen mit je {SIM_TRIALS_PER_SESSION} Durchgängen auf einem
            frischen Zustand. Es wird nichts gespeichert.
          </p>
          <button
            disabled={simBusy}
            onClick={() => {
              setSimBusy(true);
              setSimError(null);
              // Erst zeichnen lassen („läuft …“), dann rechnen.
              setTimeout(() => {
                try {
                  setSim(simulateMap(currentGeometry(props.settings.geometry!), Date.now() >>> 0));
                } catch (e) {
                  setSimError(e instanceof Error ? e.message : String(e));
                }
                setSimBusy(false);
              }, 30);
            }}
          >
            {SIM_SESSIONS} Sitzungen simulieren
          </button>
          {simBusy && <p class="hint">Simulation läuft …</p>}
          {simError && <p class="error">{simError}</p>}
          {sim && (
            <>
              <p>
                Mittlerer Schwellenfehler (RMSE): {sim.rmse === null ? 'nicht berechenbar' : `${sim.rmse.toFixed(2)} Stufen`}
                {sim.rmse !== null && ` (über ${sim.rmsePoints} Orte, an denen der Proband etwas sehen kann)`}
                <br />
                <span class="hint">Startwert {sim.seed}. Der Fehler schwankt von Lauf zu Lauf.</span>
              </p>
              <MapModeToggle mode={mode} onChange={setMode} />
              <div class="map-row">
                <MapView title="Geschätzte Karte" cells={sim.estimate} mode={mode} />
                <MapView title="Wahre Karte" cells={sim.truth} mode={mode} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
