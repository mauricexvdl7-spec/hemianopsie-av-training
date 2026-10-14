/**
 * Kamera-Testseite im Bereich für Angehörige: Kamera-Lage wählen, Kamera mit kleiner Vorschau starten, kalibrieren,
 * danach Restfehler und Live-Blickpunkt prüfen. Damit wird am echten iPad geprüft, ob die Genauigkeit reicht.
 * Datenschutz: Die Vorschau gibt es nur hier; kein Bild wird gespeichert oder übertragen.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CALIB_MARGIN_DEG, calibrationDurationMs, calibrationPoints, type CalibPoint } from '../../core/calibration';
import { CALIB_MAX_RESIDUAL_DEG, mapGaze, type CalibResult } from '../../core/gaze';
import type { GeometryInput } from '../../core/geometry';
import type { AudioEngine } from '../../io/audio';
import { startCamera, type CameraFrame, type CameraSource } from '../../io/camera';
import type { CameraPlacement, Db } from '../../store/db';
import { currentGeometry } from '../browserDeps';
import { CalibrationStage } from '../CalibrationStage';
import { unlockAudio } from '../unlockAudio';
import { placementHint } from './placement';

/** Restfehler bis hier gilt als gut. */
export const RESIDUAL_GOOD_DEG = 3;
/** So oft wird die Anzeige (fps, Gesicht, Blickpunkt) aufgefrischt. */
const LIVE_REFRESH_MS = 100;

export type ResidualBand = { level: 'good' | 'ok' | 'bad'; label: string };

/** Ampel für den Restfehler: grün bis 3°, gelb bis 5°, rot darüber (oder nicht auswertbar). */
export function residualBand(residualDeg: number): ResidualBand {
  if (residualDeg <= RESIDUAL_GOOD_DEG) return { level: 'good', label: 'gut' };
  if (residualDeg <= CALIB_MAX_RESIDUAL_DEG) return { level: 'ok', label: 'brauchbar' };
  return { level: 'bad', label: 'zu ungenau' };
}

/** Eine Nachkommastelle mit Komma, echtes Minuszeichen. */
const fmt = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',').replace('-', '−');

const PLACEMENTS: ReadonlyArray<{ value: CameraPlacement; label: string }> = [
  { value: 'side', label: 'Seitlich (älteres iPad, Kamera rechts)' },
  { value: 'top', label: 'Oben mittig (neueres iPad)' },
];

type CamState = 'off' | 'starting' | 'on' | 'failed';
type Live = { fps: number; frame: CameraFrame | null };

/** Kleine gespiegelte Vorschau (wie ein Spiegel); hängt das Video der Kamera in diesen Rahmen. */
function VideoPreview(props: { video: HTMLVideoElement }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const v = props.video;
    v.classList.add('camera-preview');
    el.appendChild(v);
    // Herausnehmen aus dem Dokument (Kalibrierbühne) kann das Video angehalten haben
    try {
      v.play()?.catch(() => undefined);
    } catch {
      // ohne Wiedergabe bleibt die Vorschau stehen
    }
    return () => {
      if (v.parentNode === el) el.removeChild(v);
      v.classList.remove('camera-preview');
    };
  }, [props.video]);
  return <div class="camera-preview-box" ref={box} />;
}

/** Skizze in Grad: Kreuz, die 5 Zielpunkte, Rahmen des nutzbaren Bereichs und der vermutete Blick. */
function GazeSketch(props: { points: readonly CalibPoint[]; gaze: { xDeg: number; yDeg: number } | null }) {
  const xs = props.points.map((p) => p.xDeg);
  const ys = props.points.map((p) => p.yDeg);
  const box = {
    x0: Math.min(...xs) - CALIB_MARGIN_DEG,
    x1: Math.max(...xs) + CALIB_MARGIN_DEG,
    y0: Math.min(...ys) - CALIB_MARGIN_DEG,
    y1: Math.max(...ys) + CALIB_MARGIN_DEG,
  };
  const pad = 2;
  // SVG-y zeigt nach unten, Grad-y nach oben
  const vb = `${box.x0 - pad} ${-box.y1 - pad} ${box.x1 - box.x0 + 2 * pad} ${box.y1 - box.y0 + 2 * pad}`;
  const g = props.gaze;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const gx = g ? clamp(g.xDeg, box.x0 - pad, box.x1 + pad) : 0;
  const gy = g ? clamp(g.yDeg, box.y0 - pad, box.y1 + pad) : 0;
  const outside = g !== null && (gx !== g.xDeg || gy !== g.yDeg);
  return (
    <svg class="gaze-sketch" viewBox={vb} role="img" aria-label="Skizze: Kreuz, Zielpunkte und vermuteter Blick">
      <rect class="gaze-frame" x={box.x0} y={-box.y1} width={box.x1 - box.x0} height={box.y1 - box.y0} />
      <path class="gaze-cross" d="M -1 0 H 1 M 0 -1 V 1" />
      {props.points
        .filter((p) => p.id !== 'center')
        .map((p) => (
          <circle key={p.id} class="gaze-target" cx={p.xDeg} cy={-p.yDeg} r={0.8} />
        ))}
      {g && <circle class={outside ? 'gaze-dot outside' : 'gaze-dot'} cx={gx} cy={-gy} r={1.2} />}
    </svg>
  );
}

export function CameraTestPage(props: { db: Db; audio: AudioEngine; onChanged(): void; start?: typeof startCamera }) {
  const start = props.start ?? startCamera;
  const [geometry, setGeometry] = useState<GeometryInput | null>(null);
  const [placement, setPlacement] = useState<CameraPlacement | null>(null);
  const [camState, setCamState] = useState<CamState>('off');
  const [camera, setCamera] = useState<CameraSource | null>(null);
  const [live, setLive] = useState<Live>({ fps: 0, frame: null });
  const [calibrating, setCalibrating] = useState(false);
  const [result, setResult] = useState<CalibResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cameraRef = useRef<CameraSource | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    props.db
      .getSettings()
      .then((s) => {
        if (!alive.current) return;
        setGeometry(s.geometry);
        setPlacement(s.camera.placement);
      })
      .catch(() => alive.current && setNote('Die Einstellungen konnten nicht geladen werden.'));
    // Beim Verlassen der Seite die Kamera immer freigeben
    return () => {
      alive.current = false;
      cameraRef.current?.stop();
      cameraRef.current = null;
    };
  }, [props.db]);

  // Letztes Kamerabild merken, Anzeige in ruhigem Takt auffrischen (nicht während der Kalibrierung: ruhige Bühne)
  useEffect(() => {
    if (!camera || calibrating) return;
    let last: CameraFrame | null = null;
    const unsubscribe = camera.subscribe((f) => (last = f));
    const timer = setInterval(() => setLive({ fps: camera.fps(), frame: last }), LIVE_REFRESH_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [camera, calibrating]);

  const choosePlacement = async (p: CameraPlacement) => {
    setPlacement(p);
    try {
      const s = await props.db.getSettings();
      await props.db.saveSettings({ ...s, camera: { ...s.camera, placement: p } });
      props.onChanged();
    } catch {
      if (alive.current) setNote('Die Kamera-Lage konnte nicht gespeichert werden.');
    }
  };

  const stopCamera = () => {
    cameraRef.current?.stop();
    cameraRef.current = null;
    setCamera(null);
    setLive({ fps: 0, frame: null });
    setCamState('off');
  };

  const begin = async () => {
    setNote(null);
    setCamState('starting');
    const cam = await start();
    if (!alive.current) {
      cam?.stop();
      return;
    }
    if (!cam) {
      setCamState('failed');
      return;
    }
    cameraRef.current = cam;
    setCamera(cam);
    setCamState('on');
  };

  const calibrate = () => {
    // Ton innerhalb der Berührung freischalten (iOS)
    unlockAudio(props.audio);
    setResult(null);
    setCalibrating(true);
  };

  const back = () => {
    stopCamera();
    location.hash = '#/admin';
  };

  if (calibrating && camera && geometry) {
    return (
      <CalibrationStage
        geometry={geometry}
        audio={props.audio}
        camera={camera}
        onDone={(r) => {
          setResult(r);
          setCalibrating(false);
        }}
      />
    );
  }

  const points = geometry ? calibrationPoints(currentGeometry(geometry)) : [];
  const frame = live.frame;
  const hint = camera && placement ? placementHint(placement, frame?.facePx ?? null) : null;
  const gaze = result?.model && frame?.features ? mapGaze(result.model, frame.features) : null;
  const band = result ? residualBand(result.residualDeg) : null;

  return (
    <div class="admin screen">
      <div class="admin-inner">
        <div class="actions back">
          <button onClick={back}>Zurück</button>
        </div>

        <section class="card">
          <h1>Kamera testen</h1>
          <p class="hint">
            Die Frontkamera misst, wohin er schaut. Kein Bild wird gespeichert; die Vorschau gibt es nur auf dieser Seite.
          </p>
          {note && <p class="error">{note}</p>}
          {!geometry && placement !== null && <p class="error">Bitte zuerst die Einrichtung durchführen.</p>}
        </section>

        <section class="card">
          <h2>Kamera-Lage</h2>
          {PLACEMENTS.map((p) => (
            <label key={p.value} class="choice">
              <input
                type="radio"
                name="camera-placement"
                checked={placement === p.value}
                disabled={placement === null}
                onChange={() => void choosePlacement(p.value)}
              />{' '}
              {p.label}
            </label>
          ))}
          <p class="hint">Gilt auch für die Hinweise in der Einrichtung.</p>
        </section>

        <section class="card">
          <h2>Kamera</h2>
          <div class="actions">
            {camState === 'on' ? (
              <button onClick={stopCamera}>Kamera stoppen</button>
            ) : (
              <button class="primary" disabled={camState === 'starting'} onClick={() => void begin()}>
                {camState === 'starting' ? 'Kamera startet …' : 'Kamera starten'}
              </button>
            )}
          </div>
          {camState === 'failed' && (
            <p class="error">Die Kamera ist nicht verfügbar. Bitte den Zugriff auf die Kamera erlauben und erneut starten.</p>
          )}
          {camera && (
            <div class="camera-live">
              <VideoPreview video={camera.video()} />
              <div>
                <p class="result-line">Bilder pro Sekunde: {live.fps}</p>
                <p class="result-line">Gesicht erkannt: {frame?.facePx ? 'ja' : 'nein'}</p>
                {frame?.facePx && (
                  <p class="result-line">
                    Nase im Bild: x {fmt(frame.facePx.x, 2)} · y {fmt(frame.facePx.y, 2)}
                  </p>
                )}
                {hint ? <p class="result-line camera-hint">{hint}</p> : <p class="result-line">Lage passt.</p>}
              </div>
            </div>
          )}
        </section>

        <section class="card">
          <h2>Kalibrieren</h2>
          <p class="hint">
            Er schaut zuerst auf das Kreuz und folgt dann dem Punkt mit den Augen, den Kopf möglichst ruhig. Dauer etwa{' '}
            {Math.round(calibrationDurationMs(points) / 1000)} Sekunden.
          </p>
          <div class="actions">
            <button class="primary" disabled={!camera || !geometry} onClick={calibrate}>
              Kalibrieren
            </button>
          </div>
          {result && band && (
            <>
              <p class={`result-line residual ${band.level}`}>
                Restfehler:{' '}
                {Number.isFinite(result.residualDeg)
                  ? `${fmt(result.residualDeg)}° – ${band.label}`
                  : `nicht auswertbar (zu wenige Bilder mit Gesicht) – ${band.label}`}
              </p>
              <p class="hint">Bis 3° gut, bis 5° brauchbar, darüber zu ungenau für das Training.</p>
            </>
          )}
          {result?.model && camera && (
            <figure>
              <figcaption>Vermuteter Blick</figcaption>
              <GazeSketch points={points} gaze={gaze} />
              <p class="result-line">
                {gaze ? `Blick: x ${fmt(gaze.xDeg)}° · y ${fmt(gaze.yDeg)}°` : 'Blick: kein Gesicht erkannt'}
              </p>
              <p class="hint">Kreuz in der Mitte, Kreise an den Zielpunkten. x negativ = links, y positiv = oben.</p>
            </figure>
          )}
        </section>
      </div>
    </div>
  );
}
