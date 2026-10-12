/** Auswertung: Schwellen-Karte je Sitzung (mit Vergleich) und Verläufe über die Sitzungen mit Phasenlinien. */
import { useEffect, useState } from 'preact/hooks';
import type { GuessRateState } from '../../core/guessRate';
import { REFERENCE_LEVEL } from '../../core/stimulus';
import type { Db, MapSnapshot, SessionRecord } from '../../store/db';
import { token } from '../theme';
import { phaseLines, sessionPoints, type SessionPoint } from './analysis';
import { LineChart } from './LineChart';
import { HitRateChart, ReactionTimeChart } from './ReportCharts';
import { MapView, cellsFromMap, diffCells, type MapCell } from './MapView';

interface Loaded {
  /** Momentaufnahmen zum Sitzungsende, nach Zeit sortiert. */
  snapshots: MapSnapshot[];
  sessions: Map<string, SessionRecord>;
  points: SessionPoint[];
  /** Rate-Wahrscheinlichkeit aus dem aktuellen Zustand, falls ein Snapshot keine hat. */
  guess: GuessRateState;
}

const NO_GUESS: GuessRateState = { falseAlarms: 0, catchTrials: 0 };

/** Datum der Sitzung (lokaler Kalendertag) als TT.MM.JJJJ. */
function sessionDate(snap: MapSnapshot, sessions: Map<string, SessionRecord>): string {
  const day = sessions.get(snap.sessionId)?.dayKey;
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) return `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
  return new Date(snap.atIso).toLocaleDateString('de-DE');
}

const percent = (v: number) => `${Math.round(v * 100)} %`;

function SessionSlider(props: { label: string; index: number; snapshots: MapSnapshot[]; sessions: Map<string, SessionRecord>; onChange(i: number): void }) {
  const snap = props.snapshots[props.index]!;
  return (
    <label>
      {props.label}: {props.index + 1} von {props.snapshots.length}, {sessionDate(snap, props.sessions)}
      <br />
      <input
        type="range"
        aria-label={props.label}
        min={0}
        max={props.snapshots.length - 1}
        step={1}
        value={props.index}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
      />
    </label>
  );
}

function MapSection(props: { data: Loaded }) {
  const { snapshots, sessions } = props.data;
  const [index, setIndex] = useState(snapshots.length - 1);
  const [compare, setCompare] = useState(false);
  const [fromIndex, setFromIndex] = useState(0);
  if (snapshots.length === 0) return <p class="hint">Noch keine abgeschlossene Sitzung.</p>;

  const cellsOf = (s: MapSnapshot): MapCell[] => cellsFromMap(s.map, s.guess ?? props.data.guess);
  const current = cellsOf(snapshots[index]!);
  const cells = compare ? diffCells(cellsOf(snapshots[fromIndex]!), current) : current;

  return (
    <>
      <SessionSlider label="Sitzung" index={index} snapshots={snapshots} sessions={sessions} onChange={setIndex} />
      <div class="actions">
        <button class={compare ? 'primary' : ''} aria-pressed={compare} onClick={() => setCompare(!compare)}>
          Vergleich
        </button>
      </div>
      {compare && <SessionSlider label="mit Sitzung" index={fromIndex} snapshots={snapshots} sessions={sessions} onChange={setFromIndex} />}
      {compare && cells && (
        <p class="hint">
          Veränderung von Sitzung {fromIndex + 1} zu Sitzung {index + 1}.
        </p>
      )}
      {cells === null ? (
        <p class="hint">Das Raster wurde dazwischen geändert, ein Vergleich ist nicht möglich.</p>
      ) : (
        <div class="map-row">
          <MapView title={`Trefferwahrscheinlichkeit (Stufe ${REFERENCE_LEVEL})`} cells={cells} mode="prob" diff={compare} />
          <MapView title="Schwelle" cells={cells} mode="theta" diff={compare} />
        </div>
      )}
    </>
  );
}

function Curves(props: { points: SessionPoint[] }) {
  const { points } = props;
  const count = points.length;
  const lines = phaseLines(points).map((l) => ({ index: l.index, label: l.stage }));
  const first = token('--accent-strong');
  const second = token('--danger');
  const third = token('--text');
  const pct = { yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1], formatY: percent };
  return (
    <>
      <HitRateChart points={points} phaseLines={lines} />
      <ReactionTimeChart points={points} phaseLines={lines} />
      <LineChart
        title="Mittlere Treppenstufe"
        count={count}
        yMin={0}
        yMax={11}
        yTicks={[0, 2, 4, 6, 8, 10]}
        formatY={(v) => String(v)}
        phaseLines={lines}
        series={[
          { label: 'oben', values: points.map((p) => p.stairMean.upper), color: first },
          { label: 'Mitte', values: points.map((p) => p.stairMean.middle), color: second },
          { label: 'unten', values: points.map((p) => p.stairMean.lower), color: third },
        ]}
      />
      <LineChart
        title="Falsch-Ton-Treffer und Falsch-Alarm-Rate"
        count={count}
        {...pct}
        phaseLines={lines}
        series={[
          { label: 'Falsch-Ton-Treffer', values: points.map((p) => p.wrongSideHitRate), color: first },
          { label: 'Falsch-Alarm-Rate', values: points.map((p) => p.falseAlarmRate), color: second },
        ]}
      />
      <p class="hint">Erste Blicksprünge nach links: ab Meilenstein 4 (Kamera).</p>
    </>
  );
}

export function EvaluationPage(props: { db: Db }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const { db } = props;
    Promise.all([db.listSessions(), db.listTrials(), db.listMapSnapshots(), db.getController()])
      .then(([sessions, trials, snaps, controller]) => {
        if (!alive) return;
        setData({
          snapshots: snaps.filter((s) => s.reason === 'sessionEnd').sort((a, b) => (a.atIso < b.atIso ? -1 : a.atIso > b.atIso ? 1 : 0)),
          sessions: new Map(sessions.map((s) => [s.id, s])),
          points: sessionPoints(sessions, trials),
          guess: controller?.guess ?? NO_GUESS,
        });
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [props.db]);

  return (
    <div class="admin screen">
      <div class="admin-inner">
        <div class="actions back">
          <button onClick={() => (location.hash = '#/admin')}>Zurück</button>
        </div>
        <section class="card">
          <h1>Auswertung</h1>
          {error && <p class="error">Die Daten konnten nicht gelesen werden.</p>}
          {!error && !data && <p class="hint">Wird geladen …</p>}
        </section>
        {data && (
          <>
            <section class="card">
              <h2>Karte</h2>
              <MapSection data={data} />
            </section>
            <section class="card">
              <h2>Verläufe</h2>
              <Curves points={data.points} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
