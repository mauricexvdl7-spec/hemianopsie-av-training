/** Liniendiagramm über die Sitzungen (Admin-Ansicht): handgeschriebenes SVG, Farben aus den Design-Tokens. */
import { token } from '../theme';

export interface Series {
  label: string;
  /** Ein Wert je Sitzung; null = keine Daten (unterbricht die Linie). */
  values: ReadonlyArray<number | null>;
  color: string;
}

const WIDTH = 640;
const HEIGHT = 300;
const LEFT = 76;
const RIGHT = 20;
const TOP = 34;
const BOTTOM = 44;
const PLOT_W = WIDTH - LEFT - RIGHT;
const PLOT_H = HEIGHT - TOP - BOTTOM;

/**
 * Diagramm mit einer Linie je Serie und einem Kreis je Wert. Phasenlinien sind senkrecht und gestrichelt;
 * `label` ist die Stufe, beschriftet wird „Phase {label}“. Bei weniger als zwei Sitzungen steht ein Hinweis.
 */
export function LineChart(props: {
  title: string;
  series: Series[];
  count: number;
  yMin: number;
  yMax: number;
  yTicks: number[];
  formatY(v: number): string;
  phaseLines: Array<{ index: number; label: string }>;
}) {
  const { count, yMin, yMax } = props;
  if (count < 2) {
    return (
      <figure class="line-chart">
        <figcaption>{props.title}</figcaption>
        <p class="hint">Noch zu wenige Sitzungen.</p>
      </figure>
    );
  }
  const x = (i: number) => LEFT + (i / (count - 1)) * PLOT_W;
  const y = (v: number) => {
    const f = yMax === yMin ? 0.5 : (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin);
    return TOP + (1 - f) * PLOT_H;
  };
  const r = (v: number) => Math.round(v * 10) / 10;

  return (
    <figure class="line-chart">
      <figcaption>{props.title}</figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        role="img"
        aria-label={props.title}
        style={{ maxWidth: '100%', height: 'auto', background: token('--bg'), borderRadius: '10px', border: `1px solid ${token('--border')}` }}
      >
        {props.yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={r(y(t))} y2={r(y(t))} stroke={token('--border')} stroke-width={1} />
            <text x={LEFT - 8} y={r(y(t)) + 5} fill={token('--muted')} font-size="15" text-anchor="end">
              {props.formatY(t)}
            </text>
          </g>
        ))}
        <text x={LEFT} y={HEIGHT - 14} fill={token('--muted')} font-size="15">
          Sitzung 1
        </text>
        <text x={WIDTH - RIGHT} y={HEIGHT - 14} fill={token('--muted')} font-size="15" text-anchor="end">
          Sitzung {count}
        </text>
        {props.phaseLines.map((p) => (
          <g key={`p${p.index}`}>
            <line
              class="phase-line"
              x1={r(x(p.index))}
              x2={r(x(p.index))}
              y1={TOP - 4}
              y2={TOP + PLOT_H}
              stroke={token('--muted')}
              stroke-width={1.5}
              stroke-dasharray="5 5"
            />
            {/* am rechten Rand links von der Linie beschriften, damit der Text im Bild bleibt */}
            <text
              x={x(p.index) > WIDTH - 100 ? r(x(p.index)) - 4 : r(x(p.index)) + 4}
              y={TOP - 10}
              fill={token('--text')}
              font-size="15"
              text-anchor={x(p.index) > WIDTH - 100 ? 'end' : 'start'}
            >
              Phase {p.label}
            </text>
          </g>
        ))}
        {props.series.map((s) => {
          let d = '';
          let penDown = false;
          s.values.slice(0, count).forEach((v, i) => {
            if (v === null) {
              penDown = false;
              return;
            }
            d += `${d ? ' ' : ''}${penDown ? 'L' : 'M'} ${r(x(i))} ${r(y(v))}`;
            penDown = true;
          });
          return (
            <g key={s.label}>
              {d && <path d={d} fill="none" stroke={s.color} stroke-width={2.5} stroke-linejoin="round" />}
              {s.values.slice(0, count).map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={r(x(i))} cy={r(y(v))} r={4.5} fill={s.color}>
                    <title>{`${s.label}, Sitzung ${i + 1}: ${props.formatY(v)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      <div class="chart-legend">
        {props.series.map((s) => (
          <span key={s.label}>
            <span class="chart-swatch" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
