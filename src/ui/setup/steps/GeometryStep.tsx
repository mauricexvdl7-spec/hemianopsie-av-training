import { useState } from 'preact/hooks';
import { gridPoints } from '../../../core/blocks';
import { maxEccentricityDeg, type GeometryInput } from '../../../core/geometry';
import { currentGeometry, isLandscape } from '../../browserDeps';
import { geometryProblems, parseCm } from '../../validate';

export function GeometryStep(props: { initial: GeometryInput; onNext(g: GeometryInput): void }) {
  const [width, setWidth] = useState(String(props.initial.screenWidthCm).replace('.', ','));
  const [dist, setDist] = useState(String(props.initial.viewingDistanceCm).replace('.', ','));
  const [fixX, setFixX] = useState(props.initial.fixationXFraction);
  const w = parseCm(width);
  const d = parseCm(dist);
  const valid = w.ok && d.ok;
  const geometry: GeometryInput | null = valid
    ? { screenWidthCm: w.value, viewingDistanceCm: d.value, fixationXFraction: fixX, fixationYFraction: 0.5 }
    : null;
  const g = geometry ? currentGeometry(geometry) : null;
  const problems = g ? geometryProblems(g) : [];

  return (
    <section class="card">
      <h1>Bildschirm und Abstand</h1>
      <label>
        Sichtbare Bildbreite in cm (mit dem Lineal quer über die leuchtende Fläche messen)
        <br />
        <input type="text" inputMode="decimal" value={width} onInput={(e) => setWidth(e.currentTarget.value)} />
      </label>
      {!w.ok && <p class="error">{w.message}</p>}
      <label>
        Abstand Augen – Bildschirm in cm
        <br />
        <input type="text" inputMode="decimal" value={dist} onInput={(e) => setDist(e.currentTarget.value)} />
      </label>
      {!d.ok && <p class="error">{d.message}</p>}
      <label>
        Position des Kreuzes: {Math.round(fixX * 100)} % der Breite (weiter rechts = mehr Platz links)
        <br />
        <input
          type="range"
          min={0.5}
          max={0.8}
          step={0.01}
          value={fixX}
          onInput={(e) => setFixX(Number(e.currentTarget.value))}
        />
      </label>
      {!isLandscape() && <p class="error">Bitte das iPad quer halten.</p>}
      {g && (
        <p class="hint">
          Links reicht das Bild bis {maxEccentricityDeg(g, 'L', 0).toFixed(1)}°, rechts bis {maxEccentricityDeg(g, 'R', 0).toFixed(1)}°.
          Rasterpunkte links: {gridPoints(g, 'L').length}, rechts: {gridPoints(g, 'R').length}.
        </p>
      )}
      {problems.map((p) => (
        <p class="error">{p}</p>
      ))}
      <div class="actions">
        <button class="primary" disabled={!geometry || problems.length > 0} onClick={() => geometry && props.onNext(geometry)}>
          Weiter
        </button>
      </div>
    </section>
  );
}
