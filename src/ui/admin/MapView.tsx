/** Schwellen-Karte des linken Halbfelds als SVG (Admin-Ansicht): ein Kreis je Rasterpunkt, Farbe nach Sichtbarkeit. */
import { makeGeometry, visualToPx } from '../../core/geometry';
import { guessRate } from '../../core/guessRate';
import type { GuessRateState } from '../../core/guessRate';
import { summarizePoint, type MapState } from '../../core/map';
import { REFERENCE_LEVEL } from '../../core/stimulus';
import type { VisualPos } from '../../core/types';
import { heatColor, thresholdColor } from '../mapColors';

export type MapMode = 'prob' | 'theta';

/** Ein Punkt der Darstellung: Ort, Trefferwahrscheinlichkeit bei der Referenzstufe und mittlere Schwelle. */
export interface MapCell {
  id: string;
  pos: VisualPos;
  p: number;
  theta: number;
  /** Unsicherheit der Schwelle (Standardabweichung), nur zur Anzeige im Tooltip. */
  thetaSd?: number;
}

/** Punkte einer gespeicherten Karte: Posterior-Zusammenfassung bei der Referenzstufe. */
export function cellsFromMap(map: MapState, guess: GuessRateState): MapCell[] {
  const gamma = guessRate(guess);
  return map.points.map((pt, i) => {
    const s = summarizePoint(map, i, REFERENCE_LEVEL, gamma);
    return { id: pt.id, pos: pt.pos, p: s.p, theta: s.thetaMean, thetaSd: s.thetaSd };
  });
}

const CELL_RADIUS_DEG = 2.2;
const RING_STEP_DEG = 10;
const WIDTH = 560;
const MARGIN = 36;
const RAD = Math.PI / 180;

/** Umschalter zwischen den beiden Darstellungen. */
export function MapModeToggle(props: { mode: MapMode; onChange(m: MapMode): void }) {
  return (
    <div role="group" aria-label="Darstellung der Karte">
      <button class={props.mode === 'prob' ? 'primary' : ''} aria-pressed={props.mode === 'prob'} onClick={() => props.onChange('prob')}>
        Trefferwahrscheinlichkeit (Stufe {REFERENCE_LEVEL})
      </button>
      <button class={props.mode === 'theta' ? 'primary' : ''} aria-pressed={props.mode === 'theta'} onClick={() => props.onChange('theta')}>
        Schwelle
      </button>
    </div>
  );
}

export function MapView(props: { title: string; cells: MapCell[]; mode: MapMode }) {
  const { cells, mode } = props;
  if (cells.length === 0) return <p class="hint">Keine Rasterpunkte.</p>;

  // Einheitsgeometrie (Abstand 1, 1 px je Einheit, Kreuz im Ursprung): gleiche Tangens-Abbildung wie auf dem Bildschirm.
  const unit = makeGeometry({ screenWidthCm: 1, viewingDistanceCm: 1, fixationXFraction: 0, fixationYFraction: 0 }, 1, 1);
  const raw = cells.map((c) => visualToPx(unit, c.pos));
  const maxEcc = Math.max(...cells.map((c) => c.pos.eccDeg));
  const reach = Math.tan((maxEcc + CELL_RADIUS_DEG) * RAD);
  const scale = (WIDTH - 2 * MARGIN) / reach;
  const yExtent = Math.max(...raw.map((r) => Math.abs(r.y)), 0.05) + Math.tan(CELL_RADIUS_DEG * RAD);
  const height = Math.round(2 * yExtent * scale + 2 * MARGIN);
  const fx = WIDTH - MARGIN;
  const fy = height / 2;
  const radius = Math.max(3, Math.tan(CELL_RADIUS_DEG * RAD) * scale);
  const rings: number[] = [];
  for (let e = RING_STEP_DEG; e <= maxEcc; e += RING_STEP_DEG) rings.push(e);
  const color = (c: MapCell) => (mode === 'prob' ? heatColor(c.p) : thresholdColor(c.theta));
  const gradient = Array.from({ length: 11 }, (_, k) => k / 10);
  const order = cells.map((_, i) => i).sort((a, b) => cells[b]!.pos.eccDeg - cells[a]!.pos.eccDeg);
  const gid = `grad-${mode}-${props.title.replace(/[^A-Za-z0-9]/g, '')}`;

  return (
    <figure style={{ margin: '0 0 16px', display: 'inline-block', verticalAlign: 'top' }}>
      <figcaption style={{ fontSize: '22px', marginBottom: '6px' }}>{props.title}</figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${height + 68}`}
        width={WIDTH}
        role="img"
        aria-label={`${props.title}: Schwellen-Karte des linken Gesichtsfelds`}
        style={{ maxWidth: '100%', height: 'auto', background: '#2e2e2e', borderRadius: '10px' }}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="1" y1="0" y2="0">
            {gradient.map((v) => (
              <stop key={v} offset={`${v * 100}%`} stop-color={mode === 'prob' ? heatColor(v) : thresholdColor((1 - v) * 14)} />
            ))}
          </linearGradient>
        </defs>
        <line x1={MARGIN / 2} x2={fx} y1={fy} y2={fy} stroke="#666" stroke-width={1} />
        {rings.map((e) => {
          const r = Math.tan(e * RAD) * scale;
          return (
            <g key={e}>
              <path d={`M ${fx} ${fy - r} A ${r} ${r} 0 0 0 ${fx} ${fy + r}`} fill="none" stroke="#666" stroke-width={1} stroke-dasharray="4 4" />
            </g>
          );
        })}
        {order.map((i) => {
          const c = cells[i]!;
          const r = raw[i]!;
          const tip = `${c.id}: p ${(c.p * 100).toFixed(0)} %, Schwelle ${c.theta.toFixed(1)}${c.thetaSd !== undefined ? ` ± ${c.thetaSd.toFixed(1)}` : ''}`;
          return (
            <circle key={c.id} cx={fx + r.x * scale} cy={fy + r.y * scale} r={radius} fill={color(c)} fill-opacity={0.92}>
              <title>{tip}</title>
            </circle>
          );
        })}
        {rings.map((e) => (
          <text
            key={e}
            x={fx - Math.tan(e * RAD) * scale}
            y={fy + 5}
            fill="#e0e0e0"
            font-size="16"
            text-anchor="middle"
            stroke="#2e2e2e"
            stroke-width={4}
            paint-order="stroke"
          >
            {e}°
          </text>
        ))}
        <g stroke="#e0e0e0" stroke-width={2}>
          <line x1={fx - 9} x2={fx + 9} y1={fy} y2={fy} />
          <line x1={fx} x2={fx} y1={fy - 9} y2={fy + 9} />
        </g>
        <text x={MARGIN / 2} y={18} fill="#b8b8b8" font-size="16">
          oben
        </text>
        <text x={MARGIN / 2} y={height - 14} fill="#b8b8b8" font-size="16">
          unten
        </text>
        <text x={WIDTH / 2} y={height + 12} fill="#b8b8b8" font-size="16" text-anchor="middle">
          Abstand vom Fixationskreuz (Sehwinkel), linkes Halbfeld
        </text>
        <rect x={MARGIN} y={height + 24} width={WIDTH - 2 * MARGIN} height={14} fill={`url(#${gid})`} stroke="#777" />
        <text x={MARGIN} y={height + 58} fill="#e0e0e0" font-size="16">
          {mode === 'prob' ? '0 % (nicht gesehen)' : 'Schwelle 14 (nicht sichtbar)'}
        </text>
        <text x={WIDTH - MARGIN} y={height + 58} fill="#e0e0e0" font-size="16" text-anchor="end">
          {mode === 'prob' ? '100 % (sicher gesehen)' : 'Schwelle 0 (gut sichtbar)'}
        </text>
      </svg>
    </figure>
  );
}
