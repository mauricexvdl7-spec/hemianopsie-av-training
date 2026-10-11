import { describe, it, expect } from 'vitest';
import { DEFAULT_TIMING, TIMING_LIMITS, clampTiming } from '../../src/core/timing';
import { PLATEAU_MS, RAMP_MS } from '../../src/core/stimulus';
import { SAFETY } from '../../src/core/safety';

describe('DEFAULT_TIMING', () => {
  it('Standard: Licht 1,0 s sichtbar, Pause 1,5–3,5 s, Tippzeit mindestens 2,0 s', () => {
    expect(DEFAULT_TIMING).toEqual({ plateauMs: 700, waitMinMs: 1500, waitMaxMs: 3500, responseWindowMinMs: 2000 });
    expect(PLATEAU_MS).toBe(700);
    expect(RAMP_MS).toBe(150);
    expect(2 * RAMP_MS + DEFAULT_TIMING.plateauMs).toBe(1000);
  });
  it('die Pause kann nie unter den Sicherheitsabstand fallen', () => {
    expect(TIMING_LIMITS.waitMinMs[0]).toBeGreaterThanOrEqual(SAFETY.minGapMs);
    expect(TIMING_LIMITS.waitMaxMs[0]).toBeGreaterThanOrEqual(SAFETY.minGapMs);
  });
});

describe('clampTiming', () => {
  it('leer → Standard', () => {
    expect(clampTiming({})).toEqual(DEFAULT_TIMING);
  });
  it('fehlende Felder kommen aus dem Standard', () => {
    expect(clampTiming({ plateauMs: 400 })).toEqual({ ...DEFAULT_TIMING, plateauMs: 400 });
  });
  it('Werte im Bereich bleiben', () => {
    const t = { plateauMs: 900, waitMinMs: 2000, waitMaxMs: 4000, responseWindowMinMs: 3000 };
    expect(clampTiming(t)).toEqual(t);
  });
  it('Werte außerhalb werden geklemmt', () => {
    expect(clampTiming({ plateauMs: 10, waitMinMs: 10, waitMaxMs: 99999, responseWindowMinMs: 10 })).toEqual({
      plateauMs: 300,
      waitMinMs: 1000,
      waitMaxMs: 6000,
      responseWindowMinMs: 1500,
    });
    expect(clampTiming({ plateauMs: 99999, waitMinMs: 99999, waitMaxMs: 99999, responseWindowMinMs: 99999 })).toEqual({
      plateauMs: 1500,
      waitMinMs: 5000,
      waitMaxMs: 6000,
      responseWindowMinMs: 4000,
    });
  });
  it('waitMaxMs < waitMinMs → waitMaxMs = waitMinMs', () => {
    expect(clampTiming({ waitMinMs: 3000, waitMaxMs: 2000 })).toMatchObject({ waitMinMs: 3000, waitMaxMs: 3000 });
  });
  it('waitMinMs nie unter 1000', () => {
    expect(clampTiming({ waitMinMs: 0 }).waitMinMs).toBe(1000);
    expect(clampTiming({ waitMinMs: -500, waitMaxMs: -1 })).toMatchObject({ waitMinMs: 1000, waitMaxMs: 1000 });
  });
  it('NaN und Unendlich fallen auf den Standard zurück', () => {
    expect(clampTiming({ plateauMs: NaN, waitMinMs: Infinity })).toMatchObject({ plateauMs: 700, waitMinMs: 1500 });
  });
});
