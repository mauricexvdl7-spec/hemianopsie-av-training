/** Blockweise Mischung der Durchgangsarten und Grundplaner für Meilenstein 1 (Phase 1 fest, Ort zufällig). */
import { fitsOnScreen, type Geometry } from './geometry';
import type { Rng } from './rng';
import { checkTrialPlan } from './safety';
import { RAMP_MS, REFERENCE_LEVEL } from './stimulus';
import { clampTiming, type TimingSettings } from './timing';
import type { Side, TrialKind, TrialPlan, VisualPos } from './types';

export const BLOCK_SIZE = 20;
export const BLOCK_COUNTS = { left: 14, right: 4, catch: 2 } as const;
export const GRID_ECC_START_DEG = 3;
export const GRID_ECC_STEP_DEG = 5;
export const GRID_ANGLE_STEP_DEG = 15;
export const GRID_MARGIN_DEG = 1;
export const JITTER_DEG = 1;

export interface GridPoint {
  id: string;
  pos: VisualPos;
}

export function makeBlock(rng: Rng): TrialKind[] {
  const kinds: TrialKind[] = [
    ...Array<TrialKind>(BLOCK_COUNTS.left).fill('left'),
    ...Array<TrialKind>(BLOCK_COUNTS.right).fill('right'),
    ...Array<TrialKind>(BLOCK_COUNTS.catch).fill('catch'),
  ];
  return rng.shuffle(kinds);
}

/** Rasterpunkte einer Halbseite, die mit 1° Rand auf den Bildschirm passen. */
export function gridPoints(g: Geometry, side: Side): GridPoint[] {
  const pts: GridPoint[] = [];
  for (let angle = -90; angle <= 90; angle += GRID_ANGLE_STEP_DEG) {
    for (let ecc = GRID_ECC_START_DEG; ecc < 90; ecc += GRID_ECC_STEP_DEG) {
      const pos: VisualPos = { side, eccDeg: ecc, angleDeg: angle };
      if (!fitsOnScreen(g, pos, GRID_MARGIN_DEG)) break;
      pts.push({ id: `${side}-e${ecc}-a${angle}`, pos });
    }
  }
  return pts;
}

/** Verschiebt einen Rasterpunkt um bis zu ±1° radial und ±1° tangential; bleibt auf dem Bildschirm. */
export function jitterPosition(rng: Rng, g: Geometry, p: VisualPos): VisualPos {
  for (let attempt = 0; attempt < 10; attempt++) {
    const eccDeg = p.eccDeg + rng.uniform(-JITTER_DEG, JITTER_DEG);
    const dAngle = ((rng.uniform(-JITTER_DEG, JITTER_DEG) / Math.max(p.eccDeg, 1)) * 180) / Math.PI;
    const angleDeg = Math.min(90, Math.max(-90, p.angleDeg + dAngle));
    const q: VisualPos = { side: p.side, eccDeg, angleDeg };
    if (fitsOnScreen(g, q, 0.5)) return q;
  }
  return p;
}

export interface BasicPlannerOptions {
  sessionId: string;
  geometry: Geometry;
  responseWindowMs: number;
  onlyKind?: TrialKind;
  /** Tempo (Plateau, Pause); fehlende Felder und Werte außerhalb der Grenzen werden durch `clampTiming` ersetzt bzw. begrenzt. */
  timing?: Partial<TimingSettings>;
}

export function createBasicPlanner(rng: Rng, opts: BasicPlannerOptions): { next(): TrialPlan } {
  const timing = clampTiming(opts.timing ?? {});
  const grids: Record<Side, GridPoint[]> = { L: gridPoints(opts.geometry, 'L'), R: gridPoints(opts.geometry, 'R') };
  let queue: TrialKind[] = [];
  let index = 0;

  return {
    next(): TrialPlan {
      if (queue.length === 0) {
        queue = opts.onlyKind ? Array<TrialKind>(BLOCK_SIZE).fill(opts.onlyKind) : makeBlock(rng);
      }
      const kind = queue.shift()!;
      let pos: VisualPos | null = null;
      let gridPointId: string | null = null;
      if (kind !== 'catch') {
        const grid = grids[kind === 'left' ? 'L' : 'R'];
        if (grid.length === 0) throw new Error('Kein Rasterpunkt passt auf den Bildschirm. Geometrie prüfen.');
        const gp = grid[rng.int(grid.length)]!;
        pos = jitterPosition(rng, opts.geometry, gp.pos);
        gridPointId = gp.id;
      }
      const plan: TrialPlan = {
        id: `${opts.sessionId}-${index}`,
        sessionId: opts.sessionId,
        index,
        kind,
        pos,
        gridPointId,
        level: kind === 'catch' ? null : REFERENCE_LEVEL,
        sound: kind === 'catch' ? 'none' : 'sync',
        soaMs: 0,
        soundGainDb: 0,
        waitMs: rng.uniform(timing.waitMinMs, timing.waitMaxMs),
        rampMs: RAMP_MS,
        plateauMs: timing.plateauMs,
        responseWindowMs: opts.responseWindowMs,
        phase: '1',
      };
      const errors = checkTrialPlan(plan);
      if (errors.length > 0) throw new Error(`Unsicherer Reizplan: ${errors.join(' ')}`);
      index++;
      return plan;
    },
  };
}
