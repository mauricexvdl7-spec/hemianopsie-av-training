/** Monatsbericht zum Ausdrucken oder Sichern als PDF (iPad: Teilen → Drucken) für die Ärztin oder den Arzt. */
import { useEffect, useState } from 'preact/hooks';
import type { GuessRateState } from '../../core/guessRate';
import { REFERENCE_LEVEL } from '../../core/stimulus';
import type { Db, MapSnapshot } from '../../store/db';
import { dayKey } from '../session';
import { DISCLAIMER_TEXT } from '../setup/steps/Disclaimer';
import { phaseLines } from './analysis';
import { MapView, cellsFromMap } from './MapView';
import { monthBounds, monthKeyOf, monthLabel, monthReport, shiftMonth, type MonthReport } from './report';
import { HitRateChart, ReactionTimeChart } from './ReportCharts';

const NO_GUESS: GuessRateState = { falseAlarms: 0, catchTrials: 0 };

/** '2026-10-01' → '1.10.2026'. */
const germanDate = (day: string) => `${Number(day.slice(8, 10))}.${Number(day.slice(5, 7))}.${day.slice(0, 4)}`;

function SnapshotCard(props: { heading: string; snapshot: MapSnapshot | null; guess: GuessRateState }) {
  const { snapshot } = props;
  return (
    <section class="card report-map">
      <h2>{props.heading}</h2>
      {snapshot ? (
        <>
          <p class="hint">Stand: {germanDate(dayKey(new Date(snapshot.atIso)))}</p>
          <MapView
            title={`Trefferwahrscheinlichkeit (Stufe ${REFERENCE_LEVEL})`}
            cells={cellsFromMap(snapshot.map, snapshot.guess ?? props.guess)}
            mode="prob"
          />
        </>
      ) : (
        <p class="hint">Keine Karte vorhanden.</p>
      )}
    </section>
  );
}

export function ReportPage(props: { db: Db; now?: Date }) {
  const [month, setMonth] = useState(() => monthKeyOf(dayKey(props.now ?? new Date())));
  const [report, setReport] = useState<MonthReport | null>(null);
  const [guess, setGuess] = useState<GuessRateState>(NO_GUESS);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const { db } = props;
    setReport(null);
    Promise.all([db.listSessions(), db.listTrials(), db.listMapSnapshots(), db.getController()])
      .then(([sessions, trials, snaps, controller]) => {
        if (!alive) return;
        setGuess(controller?.guess ?? NO_GUESS);
        setReport(monthReport(month, sessions, trials, snaps));
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [props.db, month]);

  const { fromDay, toDay } = monthBounds(month);
  const lines = report ? phaseLines(report.points).map((l) => ({ index: l.index, label: l.stage })) : [];

  return (
    <div class="admin screen report">
      <div class="admin-inner">
        <div class="actions back no-print">
          <button onClick={() => (location.hash = '#/admin')}>Zurück</button>
        </div>
        <div class="actions month-nav no-print">
          <button onClick={() => setMonth(shiftMonth(month, -1))}>‹ Vormonat</button>
          <button onClick={() => setMonth(shiftMonth(month, 1))}>Folgemonat ›</button>
        </div>
        <section class="card">
          <h1>Monatsbericht {monthLabel(month)}</h1>
          {error && <p class="error">Die Daten konnten nicht gelesen werden.</p>}
          {!error && !report && <p class="hint">Wird geladen …</p>}
          <p>
            Zeitraum: {germanDate(fromDay)} – {germanDate(toDay)}
          </p>
          {report && (
            <>
              <ul class="report-facts">
                <li>Sitzungen: {report.sessionCount}</li>
                <li>Übungszeit: {report.minutes} Minuten</li>
                <li>Phase am Monatsende: {report.stageAtEnd ?? '–'}</li>
              </ul>
            </>
          )}
        </section>
        {report && (
          <>
            <div class="report-maps">
              <SnapshotCard heading="Anfang des Monats" snapshot={report.startSnapshot} guess={guess} />
              <SnapshotCard heading="Ende des Monats" snapshot={report.endSnapshot} guess={guess} />
            </div>
            <section class="card report-curves">
              <h2>Verläufe</h2>
              <HitRateChart points={report.points} phaseLines={lines} />
              <ReactionTimeChart points={report.points} phaseLines={lines} />
            </section>
          </>
        )}
        <section class="card">
          <p class="hint">{DISCLAIMER_TEXT}</p>
        </section>
        <div class="actions no-print">
          <button class="primary" onClick={() => window.print()}>
            Drucken oder als PDF sichern
          </button>
        </div>
      </div>
    </div>
  );
}
