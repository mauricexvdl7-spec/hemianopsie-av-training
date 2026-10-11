import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng';
import { makeGeometry } from '../../src/core/geometry';
import { fitsOnScreen } from '../../src/core/geometry';
import { checkGap, checkTrialPlan, stimulusInterval } from '../../src/core/safety';
import { guessRate } from '../../src/core/guessRate';
import { pointLevel, regionOf } from '../../src/core/staircase';
import { createMap, summarizePoint } from '../../src/core/map';
import { gridPoints } from '../../src/core/blocks';
import type { SessionSummary } from '../../src/core/phases';
import type { TrialPlan, TrialRecord } from '../../src/core/types';
import {
  beginSession,
  createControllerState,
  createSessionPlanner,
  endSession,
  gridSignature,
  type ControllerState,
} from '../../src/core/controller';
import { sampleRecord } from '../helpers/plans';

const geo = (distanceCm = 40) =>
  makeGeometry({ screenWidthCm: 24, viewingDistanceCm: distanceCm, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820);
const g = geo();

function planner(state: ControllerState = createControllerState(g), seed = 1) {
  return createSessionPlanner(state, { rng: createRng(seed), geometry: g, sessionId: 's', responseWindowMs: 2000 });
}

/** Macht aus einem Plan einen Datensatz mit gewünschtem Ergebnis. */
function recordOf(plan: TrialPlan, outcome: TrialRecord['outcome'], overrides: Partial<TrialRecord> = {}): TrialRecord {
  return { ...sampleRecord(), ...plan, outcome, stairBefore: null, stairAfter: null, ...overrides };
}

/** Holt Pläne, bis einer der Art `kind` kommt (und optional die Tonbedingung passt). */
function nextOf(p: ReturnType<typeof planner>, kind: TrialPlan['kind'], sound?: TrialPlan['sound']): TrialPlan {
  for (let i = 0; i < 500; i++) {
    const plan = p.next();
    if (plan.kind === kind && (sound === undefined || plan.sound === sound)) return plan;
  }
  throw new Error('kein passender Plan');
}

describe('gridSignature', () => {
  it('sortierte Punkt-IDs, mit | verbunden', () => {
    const pts = [
      { id: 'b', pos: { side: 'L' as const, eccDeg: 1, angleDeg: 0 } },
      { id: 'a', pos: { side: 'L' as const, eccDeg: 2, angleDeg: 0 } },
    ];
    expect(gridSignature(pts)).toBe('a|b');
    expect(gridSignature([...pts].reverse())).toBe('a|b');
  });
});

describe('createControllerState', () => {
  it('Startzustand', () => {
    const s = createControllerState(g);
    expect(s.version).toBe(1);
    expect(s.sessionCount).toBe(0);
    expect(s.halfLifeSessions).toBe(7);
    expect(s.phase.stage).toBe('1');
    expect(s.gridSignature).toBe(gridSignature(gridPoints(g, 'L')));
    expect(s.map.points.length).toBe(gridPoints(g, 'L').length);
  });
});

describe('next()', () => {
  it('1000 Pläne: sicher, je 20 genau 14/4/2, Orte gültig, Stufen 0..11, Phase 1', () => {
    const p = planner();
    const plans = Array.from({ length: 1000 }, () => p.next());
    for (const plan of plans) {
      expect(checkTrialPlan(plan)).toEqual([]);
      expect(plan.phase).toBe('1');
      expect(plan.responseWindowMs).toBe(2000);
    }
    for (let b = 0; b < 50; b++) {
      const blk = plans.slice(b * 20, b * 20 + 20);
      const count = (k: string) => blk.filter((x) => x.kind === k).length;
      expect([count('left'), count('right'), count('catch')]).toEqual([14, 4, 2]);
    }
    for (const plan of plans) {
      if (plan.kind === 'catch') continue;
      expect(plan.pos!.side).toBe(plan.kind === 'left' ? 'L' : 'R');
      expect(fitsOnScreen(g, plan.pos!, 0)).toBe(true);
      expect(plan.level!).toBeGreaterThanOrEqual(0);
      expect(plan.level!).toBeLessThanOrEqual(11);
      expect(plan.gridPointId).not.toBeNull();
    }
    expect(plans.map((x) => x.index)).toEqual(Array.from({ length: 1000 }, (_, i) => i));
    expect(plans[3]!.id).toBe('s-3');
  });

  it('rechte Pläne haben Referenzstufe', () => {
    const p = planner();
    let seen = 0;
    for (let i = 0; i < 200; i++) {
      const plan = p.next();
      if (plan.kind !== 'right') continue;
      seen++;
      expect(plan.level).toBe(6);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('linke Pläne tragen die Treppenstufe ihrer Region, begrenzt auf round(θ̂) ± 1', () => {
    const s = createControllerState(g);
    s.stairs.upper.level = 3;
    s.stairs.lower.level = 8; // Mitte bleibt bei 6
    const p = planner(s);
    // leere Karte: θ̂ = 6,5 → Band 6..8; oben 3 wird auf 6 angehoben, unten 8 und Mitte 6 bleiben
    const expected = { upper: 6, middle: 6, lower: 8 } as const;
    const seen = { upper: 0, middle: 0, lower: 0 };
    for (let i = 0; i < 400; i++) {
      const plan = p.next();
      if (plan.kind !== 'left') continue;
      const gp = s.map.points.find((q) => q.id === plan.gridPointId)!;
      const region = regionOf(gp.pos.angleDeg);
      seen[region]++;
      expect(plan.level).toBe(expected[region]);
    }
    expect(seen.upper).toBeGreaterThan(0);
    expect(seen.middle).toBeGreaterThan(0);
    expect(seen.lower).toBeGreaterThan(0);
  });

  it('nach zwei Treffern in einer Region trägt der nächste Plan dieser Region die gesenkte Stufe (im Band um θ̂)', () => {
    const p = planner();
    const first = nextOf(p, 'left', 'sync');
    const region = regionOf(p.state().map.points.find((q) => q.id === first.gridPointId)!.pos.angleDeg);
    p.apply(recordOf(first, 'hit'));
    p.apply(recordOf(first, 'hit'));
    const st = p.state();
    expect(st.stairs[region].level).toBe(4);
    let checked = 0;
    let lowered = 0;
    for (let i = 0; i < 400; i++) {
      const plan = p.next();
      if (plan.kind !== 'left') continue;
      const j = st.map.points.findIndex((q) => q.id === plan.gridPointId);
      const r = regionOf(st.map.points[j]!.pos.angleDeg);
      const theta = summarizePoint(st.map, j, 6, guessRate(st.guess)).thetaMean;
      expect(plan.level).toBe(pointLevel(r === region ? 4 : 6, theta));
      if (r === region && plan.level! < 6) lowered++;
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(lowered).toBeGreaterThan(0); // nahe dem Treffer senkt die Karte θ̂, dort kommt die gesenkte Stufe an
  });

  it('kein linker Punkt zweimal direkt hintereinander (nach Raster-ID)', () => {
    const p = planner();
    let last: string | null = null;
    for (let i = 0; i < 600; i++) {
      const plan = p.next();
      if (plan.kind !== 'left') continue;
      expect(plan.gridPointId).not.toBe(last);
      last = plan.gridPointId;
    }
  });

  it('Pläne enthalten Ton nach Phase', () => {
    const s = createControllerState(g);
    s.phase.stage = '2';
    const p = planner(s);
    const plans = Array.from({ length: 200 }, () => p.next());
    expect(plans.every((x) => x.phase === '2')).toBe(true);
    expect(plans.some((x) => x.sound === 'lead' && x.soaMs <= -100 && x.soaMs >= -300)).toBe(true);
  });

  it('führender Ton: Wartezeit zählt bis zum ersten Reiz, also 1,5–3,5 s bis zum Ton', () => {
    const s = createControllerState(g);
    s.phase.stage = '2';
    const p = planner(s);
    const plans = Array.from({ length: 500 }, () => p.next());
    const led = plans.filter((x) => x.soaMs < 0);
    expect(led.length).toBeGreaterThan(0);
    for (const x of plans) {
      expect(x.waitMs + Math.min(0, x.soaMs)).toBeGreaterThanOrEqual(1500);
      expect(x.waitMs + Math.min(0, x.soaMs)).toBeLessThanOrEqual(3500);
    }
  });

  it('Standard-Plateau 700 ms (Licht 1,0 s sichtbar)', () => {
    const p = planner();
    for (let i = 0; i < 100; i++) {
      const x = p.next();
      expect(x.plateauMs).toBe(700);
      expect(x.rampMs).toBe(150);
    }
  });

  it('Timing-Optionen: Plateau und Zeit bis zum ersten Reiz (auch mit führendem Ton)', () => {
    const s = createControllerState(g);
    s.phase.stage = '2';
    const timing = { plateauMs: 400, waitMinMs: 2000, waitMaxMs: 2500, responseWindowMinMs: 2000 };
    const p = createSessionPlanner(s, { rng: createRng(3), geometry: g, sessionId: 's', responseWindowMs: 2000, timing });
    const plans = Array.from({ length: 300 }, () => p.next());
    expect(plans.some((x) => x.soaMs < 0)).toBe(true);
    for (const x of plans) {
      expect(x.plateauMs).toBe(400);
      expect(x.waitMs + Math.min(0, x.soaMs)).toBeGreaterThanOrEqual(2000);
      expect(x.waitMs + Math.min(0, x.soaMs)).toBeLessThanOrEqual(2500);
    }
  });

  it('kürzestes Tempo (Plateau 300, Pause 1000) hält bei schnellster Taktung 1000 ms Abstand, auch mit führendem Ton', () => {
    const s = createControllerState(g);
    s.phase.stage = '2';
    const timing = { plateauMs: 300, waitMinMs: 1000, waitMaxMs: 1000 };
    const p = createSessionPlanner(s, { rng: createRng(4), geometry: g, sessionId: 's', responseWindowMs: 1500, timing });
    const plans = Array.from({ length: 500 }, () => p.next());
    expect(plans.some((x) => x.soaMs < 0)).toBe(true);
    let end: number | null = null;
    let t = 0;
    for (const x of plans) {
      expect(checkTrialPlan(x)).toEqual([]);
      const iv = stimulusInterval(x);
      const t0 = t + x.waitMs;
      if (iv) {
        expect(checkGap(end, t0 + iv.startMs)).toEqual([]);
        end = t0 + iv.endMs;
      }
      t = t0 + 2 * x.rampMs + x.plateauMs;
    }
  });
});

describe('apply()', () => {
  it('linker Treffer ändert Karte und Treppe, setzt stairBefore/After', () => {
    const p = planner();
    const before = p.state();
    const plan = nextOf(p, 'left', 'sync');
    const out = p.apply(recordOf(plan, 'hit'));
    const after = p.state();
    expect(after.map.logLik).not.toEqual(before.map.logLik);
    expect(out.stairBefore).toBe(6);
    expect(out.stairAfter).toBe(6); // erster Treffer: noch keine Bewegung
    const region = regionOf(before.map.points.find((q) => q.id === plan.gridPointId)!.pos.angleDeg);
    expect(after.stairs[region].hitStreak).toBe(1);
  });

  it('zwei Treffer in derselben Region senken deren Stufe', () => {
    const p = planner();
    const plan = nextOf(p, 'left', 'sync');
    const a = p.apply(recordOf(plan, 'hit'));
    const b = p.apply(recordOf(plan, 'hit'));
    expect([a.stairBefore, a.stairAfter]).toEqual([6, 6]);
    expect([b.stairBefore, b.stairAfter]).toEqual([6, 4]);
    const region = regionOf(p.state().map.points.find((q) => q.id === plan.gridPointId)!.pos.angleDeg);
    expect(p.state().stairs[region].level).toBe(4);
  });

  it('Fehlversuch hebt die Stufe', () => {
    const p = planner();
    const plan = nextOf(p, 'left', 'sync');
    const out = p.apply(recordOf(plan, 'miss'));
    expect([out.stairBefore, out.stairAfter]).toEqual([6, 8]);
  });

  it('wrongSide ändert nur die Karte, nicht die Treppe', () => {
    const s = createControllerState(g);
    s.phase.stage = '2';
    const p = planner(s);
    const before = p.state();
    const plan = nextOf(p, 'left', 'wrongSide');
    const out = p.apply(recordOf(plan, 'hit'));
    const after = p.state();
    expect(after.map.logLik).not.toEqual(before.map.logLik);
    expect(after.stairs).toEqual(before.stairs);
    expect(out.stairBefore).toBeNull();
    expect(out.stairAfter).toBeNull();
  });

  it('rechter Treffer ändert nichts', () => {
    const p = planner();
    const before = p.state();
    const plan = nextOf(p, 'right');
    const out = p.apply(recordOf(plan, 'hit'));
    expect(p.state()).toEqual(before);
    expect(out.stairBefore).toBeNull();
    expect(out.stairAfter).toBeNull();
  });

  it('Vorwegnahme und Abbruch ändern nichts', () => {
    const p = planner();
    const before = p.state();
    const plan = nextOf(p, 'left', 'sync');
    for (const o of ['anticipation', 'aborted'] as const) {
      const out = p.apply(recordOf(plan, o));
      expect(out.stairBefore).toBeNull();
      expect(out.stairAfter).toBeNull();
    }
    expect(p.state()).toEqual(before);
  });

  it('catch + falseAlarm erhöht falseAlarms, correctRejection nur catchTrials', () => {
    const p = planner();
    const plan = nextOf(p, 'catch');
    const before = p.state();
    p.apply(recordOf(plan, 'falseAlarm'));
    expect(p.state().guess).toEqual({ falseAlarms: 1, catchTrials: 1 });
    p.apply(recordOf(plan, 'correctRejection'));
    expect(p.state().guess).toEqual({ falseAlarms: 1, catchTrials: 2 });
    expect(p.state().map).toEqual(before.map);
    expect(p.state().stairs).toEqual(before.stairs);
    expect(guessRate(p.state().guess)).toBeGreaterThan(guessRate(before.guess));
  });

  it('nutzt die tatsächliche (verschobene) Position für die Karte', () => {
    const p1 = planner();
    const p2 = planner();
    const plan = nextOf(p1, 'left', 'sync');
    nextOf(p2, 'left', 'sync');
    p1.apply(recordOf(plan, 'hit'));
    const moved = { ...plan.pos!, eccDeg: plan.pos!.eccDeg + 0.9 };
    p2.apply(recordOf(plan, 'hit', { pos: moved }));
    expect(p1.state().map.logLik).not.toEqual(p2.state().map.logLik);
  });
});

describe('summary()', () => {
  it('Mittel der dargebotenen linken Stufen und Trefferquote ohne wrongSide', () => {
    const p = planner();
    const plan = nextOf(p, 'left', 'sync');
    // dargebotene Stufen 9, 9, 3 (Treppenstufe der Region davor wäre 6, 6, 4)
    p.apply(recordOf(plan, 'hit', { level: 9 }));
    p.apply(recordOf(plan, 'hit', { level: 9 }));
    p.apply(recordOf(plan, 'miss', { level: 3 }));
    const s = p.summary(12);
    expect(s.stage).toBe('1');
    expect(s.durationMin).toBe(12);
    expect(s.meanLeftLevel).toBeCloseTo((9 + 9 + 3) / 3, 10);
    expect(s.leftHitRate).toBeCloseTo(2 / 3, 10);
  });

  it('ohne qualifizierende Durchgänge: Mittel der Regionsstufen, Trefferquote 0', () => {
    const p = planner();
    const s = p.summary(15);
    expect(s.meanLeftLevel).toBe(6);
    expect(s.leftHitRate).toBe(0);
  });
});

describe('beginSession', () => {
  it('gleiche Geometrie: Vergessen, keine Ersetzung, Eingabe unverändert', () => {
    const s = createControllerState(g);
    const p = planner(s);
    p.apply(recordOf(nextOf(p, 'left', 'sync'), 'hit'));
    const st = p.state();
    const snapshot = JSON.parse(JSON.stringify(st));
    const { state, replacedMap } = beginSession(st, g);
    expect(replacedMap).toBeNull();
    expect(st).toEqual(snapshot);
    const f = 0.5 ** (1 / 7);
    st.map.logLik.forEach((row, i) => row.forEach((v, t) => expect(state.map.logLik[i]![t]).toBeCloseTo(v * f, 12)));
  });

  it('anderer Abstand: neue Karte, alte zurück, Treppe und Phase unverändert', () => {
    const p = planner();
    p.apply(recordOf(nextOf(p, 'left', 'sync'), 'hit'));
    p.apply(recordOf(nextOf(p, 'left', 'sync'), 'miss'));
    const st = p.state();
    const g2 = geo(25);
    const { state, replacedMap } = beginSession(st, g2);
    expect(replacedMap).toEqual(st.map);
    expect(state.gridSignature).toBe(gridSignature(gridPoints(g2, 'L')));
    expect(state.gridSignature).not.toBe(st.gridSignature);
    expect(state.map).toEqual(createMap(gridPoints(g2, 'L')));
    expect(state.stairs).toEqual(st.stairs);
    expect(state.phase).toEqual(st.phase);
    expect(state.guess).toEqual(st.guess);
  });
});

describe('endSession', () => {
  it('5 stabile Sitzungen >= 10 min -> Stufe 2, sessionCount 5', () => {
    let s = createControllerState(g);
    const sum: SessionSummary = { stage: '1', durationMin: 12, meanLeftLevel: 4, leftHitRate: 0.8 };
    for (let i = 0; i < 5; i++) s = endSession(s, sum, `2026-10-1${i}T10:00:00.000Z`);
    expect(s.phase.stage).toBe('2');
    expect(s.sessionCount).toBe(5);
  });

  it('kurze Sitzung zählt als Sitzung, aber nicht fürs Kriterium', () => {
    const s = endSession(createControllerState(g), { stage: '1', durationMin: 3, meanLeftLevel: 4, leftHitRate: 0.8 }, 'x');
    expect(s.sessionCount).toBe(1);
    expect(s.phase.sessionsInStage).toBe(0);
  });
});

describe('Zustand ist reines JSON', () => {
  it('Rundreise liefert gleichen Zustand, state() ist tiefe Kopie', () => {
    const p = planner();
    for (let i = 0; i < 40; i++) {
      const plan = p.next();
      p.apply(recordOf(plan, plan.kind === 'catch' ? 'correctRejection' : i % 3 ? 'hit' : 'miss'));
    }
    const st = p.state();
    expect(JSON.parse(JSON.stringify(st))).toEqual(st);
    st.map.logLik[0]![0] = 999;
    expect(p.state().map.logLik[0]![0]).not.toBe(999);
  });

  it('createSessionPlanner verändert den übergebenen Zustand nicht', () => {
    const s = createControllerState(g);
    const snapshot = JSON.parse(JSON.stringify(s));
    const p = planner(s);
    p.apply(recordOf(nextOf(p, 'left', 'sync'), 'hit'));
    expect(s).toEqual(snapshot);
  });
});
