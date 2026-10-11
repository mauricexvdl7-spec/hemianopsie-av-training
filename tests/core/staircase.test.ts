import { describe, expect, it } from 'vitest';
import { psychometric } from '../../src/core/map';
import { createRng } from '../../src/core/rng';
import { REFERENCE_LEVEL } from '../../src/core/stimulus';
import { createStairs, pointLevel, regionOf, REGIONS, updateStair, type StairState } from '../../src/core/staircase';

function apply(s: StairState, hits: boolean[]): StairState {
  return hits.reduce((acc, h) => updateStair(acc, h), s);
}

describe('regionOf', () => {
  it('trennt oben, Mitte und unten bei ±30°', () => {
    expect(regionOf(31)).toBe('upper');
    expect(regionOf(30)).toBe('middle');
    expect(regionOf(-30)).toBe('middle');
    expect(regionOf(-31)).toBe('lower');
  });
});

describe('createStairs', () => {
  it('startet jede Region auf der Referenzstufe', () => {
    const stairs = createStairs();
    expect(REGIONS).toEqual(['upper', 'middle', 'lower']);
    for (const r of REGIONS) {
      expect(stairs[r]).toEqual({ level: REFERENCE_LEVEL, hitStreak: 0, reversals: 0, lastDirection: 0 });
    }
  });

  it('akzeptiert eine Startstufe', () => {
    expect(createStairs(3).middle.level).toBe(3);
  });
});

describe('updateStair', () => {
  const start = (): StairState => createStairs().middle;

  it('ein einzelner Treffer ändert nur die Trefferserie', () => {
    const s = updateStair(start(), true);
    expect(s).toEqual({ level: 6, hitStreak: 1, reversals: 0, lastDirection: 0 });
  });

  it('ist rein und liefert ein neues Objekt', () => {
    const s0 = start();
    const s1 = updateStair(s0, false);
    expect(s1).not.toBe(s0);
    expect(s0).toEqual({ level: 6, hitStreak: 0, reversals: 0, lastDirection: 0 });
  });

  it('Schritt 2 bis zur ersten Umkehr, danach Schritt 1', () => {
    let s = apply(start(), [true, true]);
    expect(s.level).toBe(4);
    expect(s.hitStreak).toBe(0);
    expect(s.reversals).toBe(0);
    s = updateStair(s, false);
    expect(s.level).toBe(6);
    expect(s.reversals).toBe(1);
    s = apply(s, [true, true]);
    expect(s.level).toBe(5);
    expect(s.reversals).toBe(2);
  });

  it('Fehlversuch setzt die Trefferserie zurück', () => {
    const s = apply(start(), [true, false]);
    expect(s.hitStreak).toBe(0);
    expect(s.level).toBe(8);
  });

  it('Klemmen an der Obergrenze ist keine Umkehr', () => {
    let s = apply(start(), Array<boolean>(20).fill(false));
    expect(s.level).toBe(11);
    expect(s.reversals).toBe(0);
    s = apply(s, [true, true]);
    expect(s.level).toBe(9);
    expect(s.reversals).toBe(1);
  });

  it('läuft nie unter 0', () => {
    let s = start();
    for (let i = 0; i < 40; i++) {
      s = updateStair(s, true);
      expect(s.level).toBeGreaterThanOrEqual(0);
    }
    expect(s.level).toBe(0);
  });
});

describe('Konvergenz', () => {
  function hitRate(theta: number, seed: number): number {
    const rng = createRng(seed);
    let s = createStairs().middle;
    let hits = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const hit = rng.next() < psychometric(s.level, theta, 0.04);
      if (hit) hits++;
      s = updateStair(s, hit);
    }
    return hits / n;
  }

  it('Trefferquote nahe 70,7 % bei θ = 5', () => {
    const rate = hitRate(5, 11);
    expect(rate).toBeGreaterThanOrEqual(0.65);
    expect(rate).toBeLessThanOrEqual(0.76);
  });

  it('Trefferquote nahe 70,7 % bei θ = 8', () => {
    const rate = hitRate(8, 12);
    expect(rate).toBeGreaterThanOrEqual(0.65);
    expect(rate).toBeLessThanOrEqual(0.76);
  });
});

describe('pointLevel', () => {
  it('lässt die Regionsstufe im Band round(θ̂) ± 1 unverändert', () => {
    expect(pointLevel(6, 6.2)).toBe(6);
    expect(pointLevel(5, 6.2)).toBe(5);
    expect(pointLevel(7, 6.2)).toBe(7);
  });
  it('begrenzt auf das Band um die Kartenschwelle', () => {
    expect(pointLevel(11, 5.4)).toBe(6);
    expect(pointLevel(0, 9.6)).toBe(9);
  });
  it('bleibt in 0..11', () => {
    expect(pointLevel(11, 13.6)).toBe(11);
    expect(pointLevel(0, -1)).toBe(0);
    expect(pointLevel(6, 14)).toBe(11);
  });
});
