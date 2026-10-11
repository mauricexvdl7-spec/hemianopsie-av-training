import { describe, it, expect } from 'vitest';
import { DEFAULT_TIMING } from '../../src/core/timing';
import { DEFAULT_SETTINGS } from '../../src/store/db';
import { applyTiming, formatSeconds, visibleMs } from '../../src/ui/admin/tempo';

describe('Tempo-Hilfen', () => {
  it('Licht sichtbar = Plateau + 300 ms; Standard 1,0 s', () => {
    expect(visibleMs(DEFAULT_TIMING.plateauMs)).toBe(1000);
    expect(visibleMs(300)).toBe(600);
    expect(visibleMs(1500)).toBe(1800);
  });
  it('Sekunden mit einer Nachkommastelle und Komma', () => {
    expect(formatSeconds(1000)).toBe('1,0 s');
    expect(formatSeconds(3500)).toBe('3,5 s');
  });
});

describe('applyTiming', () => {
  it('ohne Referenzwerte: Standardfenster, mindestens die Untergrenze', () => {
    expect(applyTiming(DEFAULT_SETTINGS, { responseWindowMinMs: 1500 }).responseWindowMs).toBe(2000);
    expect(applyTiming(DEFAULT_SETTINGS, { responseWindowMinMs: 3500 }).responseWindowMs).toBe(3500);
  });
  it('mit weniger als 5 Referenzwerten wie ohne', () => {
    expect(applyTiming({ ...DEFAULT_SETTINGS, referenceRtsMs: [500, 600] }, { responseWindowMinMs: 3000 }).responseWindowMs).toBe(3000);
  });
  it('mit mindestens 5 Referenzwerten: neu aus den Werten mit neuer Untergrenze', () => {
    const s = { ...DEFAULT_SETTINGS, referenceRtsMs: [500, 520, 540, 560, 580], responseWindowMs: 2000 };
    expect(applyTiming(s, { responseWindowMinMs: 1500 }).responseWindowMs).toBe(1500);
    expect(applyTiming(s, { responseWindowMinMs: 3500 }).responseWindowMs).toBe(3500);
  });
  it('speichert geklemmtes Timing und lässt übrige Einstellungen unverändert', () => {
    const out = applyTiming({ ...DEFAULT_SETTINGS, disclaimerAcceptedAt: 'x' }, { plateauMs: 5, waitMinMs: 3000, waitMaxMs: 2000 });
    expect(out.timing).toEqual({ ...DEFAULT_TIMING, plateauMs: 300, waitMinMs: 3000, waitMaxMs: 3000 });
    expect(out.disclaimerAcceptedAt).toBe('x');
  });
});
