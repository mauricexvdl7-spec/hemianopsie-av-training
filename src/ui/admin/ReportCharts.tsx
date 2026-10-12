/** Die beiden Verläufe, die Auswertung und Monatsbericht gemeinsam zeigen: Trefferquote links und Reaktionszeit. */
import { token } from '../theme';
import type { SessionPoint } from './analysis';
import { LineChart } from './LineChart';

const percent = (v: number) => `${Math.round(v * 100)} %`;

/** Obergrenze der Reaktionszeit-Achse: mindestens 1000 ms, auf 250 ms aufgerundet. */
export function rtAxisMax(points: SessionPoint[]): number {
  const all = points.flatMap((p) => [p.rtLeftMedianMs, p.rtRightMedianMs]).filter((v): v is number => v !== null);
  return Math.max(1000, Math.ceil(Math.max(0, ...all) / 250) * 250);
}

/** Phasenlinien im Format des Diagramms: `label` ist die bloße Stufe. */
export type ChartPhaseLines = Array<{ index: number; label: string }>;

export function HitRateChart(props: { points: SessionPoint[]; phaseLines: ChartPhaseLines }) {
  const { points } = props;
  return (
    <LineChart
      title="Trefferquote links"
      count={points.length}
      yMin={0}
      yMax={1}
      yTicks={[0, 0.25, 0.5, 0.75, 1]}
      formatY={percent}
      phaseLines={props.phaseLines}
      series={[
        { label: 'nur Licht', values: points.map((p) => p.lightOnlyHitRate), color: token('--accent-strong') },
        { label: 'gesamt', values: points.map((p) => p.leftHitRate), color: token('--danger') },
      ]}
    />
  );
}

export function ReactionTimeChart(props: { points: SessionPoint[]; phaseLines: ChartPhaseLines }) {
  const { points } = props;
  const rtMax = rtAxisMax(points);
  return (
    <LineChart
      title="Reaktionszeit (Median)"
      count={points.length}
      yMin={0}
      yMax={rtMax}
      yTicks={[0, 1, 2, 3, 4].map((k) => (k * rtMax) / 4)}
      formatY={(v) => `${Math.round(v)} ms`}
      phaseLines={props.phaseLines}
      series={[
        { label: 'links', values: points.map((p) => p.rtLeftMedianMs), color: token('--accent-strong') },
        { label: 'rechts', values: points.map((p) => p.rtRightMedianMs), color: token('--danger') },
      ]}
    />
  );
}
