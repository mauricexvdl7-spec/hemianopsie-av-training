import { describe, it, expect } from 'vitest';
import { formatDateDe, greeting } from '../../src/ui/greeting';

const at = (h: number, m: number) => new Date(2026, 9, 11, h, m);

describe('greeting', () => {
  it('wechselt genau an den Grenzen', () => {
    expect(greeting(at(4, 59))).toBe('Hallo');
    expect(greeting(at(5, 0))).toBe('Guten Morgen');
    expect(greeting(at(10, 59))).toBe('Guten Morgen');
    expect(greeting(at(11, 0))).toBe('Guten Tag');
    expect(greeting(at(17, 59))).toBe('Guten Tag');
    expect(greeting(at(18, 0))).toBe('Guten Abend');
    expect(greeting(at(22, 59))).toBe('Guten Abend');
    expect(greeting(at(23, 0))).toBe('Hallo');
    expect(greeting(at(0, 0))).toBe('Hallo');
  });
});

describe('formatDateDe', () => {
  it('Wochentag, Tag und Monat auf Deutsch', () => {
    expect(formatDateDe(new Date(2026, 9, 11))).toBe('Sonntag, 11. Oktober');
    expect(formatDateDe(new Date(2026, 2, 1))).toBe('Sonntag, 1. März');
    expect(formatDateDe(new Date(2026, 11, 31))).toBe('Donnerstag, 31. Dezember');
  });
});
