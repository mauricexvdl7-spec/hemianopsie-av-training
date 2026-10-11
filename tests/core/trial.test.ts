import { describe, it, expect } from 'vitest';
import { classifyResponse, responseWindowFromReference, MIN_RT_MS, DEFAULT_WINDOW_MS } from '../../src/core/trial';
import type { TrialKind } from '../../src/core/types';

describe('classifyResponse', () => {
  it.each([
    ['left', 149, 'anticipation'],
    ['left', -100, 'anticipation'],
    ['left', 150, 'hit'],
    ['left', 2000, 'hit'],
    ['left', 2001, 'miss'],
    ['left', null, 'miss'],
    ['right', 400, 'hit'],
    ['catch', 500, 'falseAlarm'],
    ['catch', null, 'correctRejection'],
    ['catch', 100, 'falseAlarm'],
    ['catch', 2500, 'correctRejection'],
  ])('%s rt=%s → %s', (k, rt, o) => {
    expect(classifyResponse(k as TrialKind, rt as number | null, 2000)).toBe(o);
  });

  it('Konstanten', () => {
    expect(MIN_RT_MS).toBe(150);
    expect(DEFAULT_WINDOW_MS).toBe(2000);
  });
});

describe('responseWindowFromReference', () => {
  it('Median + 3·MAD, begrenzt auf 1500..3000 bei Untergrenze 1500', () => {
    expect(responseWindowFromReference([500, 520, 540, 560, 580], 1500)).toBe(1500);
    expect(responseWindowFromReference([1500, 1600, 1700, 1800, 1900], 1500)).toBe(2000);
    expect(responseWindowFromReference([1000, 1400, 1800, 2200, 2600], 1500)).toBe(3000);
  });
  it('Standard-Untergrenze ist 2000 ms', () => {
    expect(responseWindowFromReference([500, 520, 540, 560, 580])).toBe(2000);
    expect(responseWindowFromReference([1000, 1400, 1800, 2200, 2600])).toBe(3000);
  });
  it('einstellbare Untergrenze: 1500, 3500; Obergrenze wächst mit', () => {
    expect(responseWindowFromReference([500, 520, 540, 560, 580], 1500)).toBe(1500);
    expect(responseWindowFromReference([500, 520, 540, 560, 580], 3500)).toBe(3500);
    expect(responseWindowFromReference([1000, 1400, 1800, 2200, 2600], 3500)).toBe(3500);
  });
  it('weniger als 5 Werte → Standard bzw. Untergrenze, falls größer', () => {
    expect(responseWindowFromReference([600])).toBe(2000);
    expect(responseWindowFromReference([])).toBe(2000);
    expect(responseWindowFromReference([], 3000)).toBe(3000);
    expect(responseWindowFromReference([600], 1500)).toBe(2000);
  });
  it('Reihenfolge egal', () => {
    expect(responseWindowFromReference([1900, 1500, 1800, 1600, 1700])).toBe(2000);
  });
});
