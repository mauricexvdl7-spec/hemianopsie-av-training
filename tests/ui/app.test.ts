import { describe, it, expect } from 'vitest';
import { resolveRoute, blockSummary } from '../../src/ui/routing';
import { DEFAULT_SETTINGS, DEFAULT_GEOMETRY } from '../../src/store/db';
import { sampleRecord } from '../helpers/plans';

const ready = { ...DEFAULT_SETTINGS, disclaimerAcceptedAt: 'x', geometry: DEFAULT_GEOMETRY };

const ADMIN_HASHES = ['#/admin', '#/admin/settings', '#/admin/voice', '#/admin/eval', '#/admin/report', '#/admin/export', '#/admin/test', '#/export', '#/test'];

describe('resolveRoute', () => {
  it('ohne bestätigten Hinweis immer Einrichtung', () => {
    for (const h of ['#/', '#/train', '#/setup', '', ...ADMIN_HASHES]) {
      for (const unlocked of [false, true]) {
        expect(resolveRoute(h, { ...ready, disclaimerAcceptedAt: null }, unlocked)).toBe('setup');
      }
    }
  });

  it('ohne Geometrie Einrichtung, außer Export (Datenrettung)', () => {
    expect(resolveRoute('#/train', { ...ready, geometry: null }, true)).toBe('setup');
    expect(resolveRoute('#/', { ...ready, geometry: null }, false)).toBe('setup');
    expect(resolveRoute('#/export', { ...ready, geometry: null }, true)).toBe('export');
    expect(resolveRoute('#/admin/export', { ...ready, geometry: null }, true)).toBe('export');
  });

  it('Ersteinrichtung ohne Geometrie braucht keine PIN', () => {
    expect(resolveRoute('#/setup', { ...ready, geometry: null }, false)).toBe('setup');
  });

  it('PIN-Bereich und Einrichtung gesperrt → PIN-Eingabe', () => {
    for (const h of [...ADMIN_HASHES, '#/setup']) {
      expect(resolveRoute(h, ready, false)).toBe('pin');
    }
  });

  it('Start und Training ohne PIN', () => {
    expect(resolveRoute('#/', ready, false)).toBe('start');
    expect(resolveRoute('', ready, false)).toBe('start');
    expect(resolveRoute('#/train', ready, false)).toBe('train');
    expect(resolveRoute('#/unbekannt', ready, false)).toBe('start');
  });

  it('bekannte Routen (entsperrt)', () => {
    expect(resolveRoute('#/', ready, true)).toBe('start');
    expect(resolveRoute('', ready, true)).toBe('start');
    expect(resolveRoute('#/train', ready, true)).toBe('train');
    expect(resolveRoute('#/setup', ready, true)).toBe('setup');
    expect(resolveRoute('#/admin', ready, true)).toBe('admin');
    expect(resolveRoute('#/admin/settings', ready, true)).toBe('settings');
    expect(resolveRoute('#/admin/voice', ready, true)).toBe('voice');
    expect(resolveRoute('#/admin/eval', ready, true)).toBe('eval');
    expect(resolveRoute('#/admin/report', ready, true)).toBe('report');
    expect(resolveRoute('#/admin/export', ready, true)).toBe('export');
    expect(resolveRoute('#/export', ready, true)).toBe('export');
    expect(resolveRoute('#/admin/test', ready, true)).toBe('test');
    expect(resolveRoute('#/test', ready, true)).toBe('test');
    expect(resolveRoute('#/unbekannt', ready, true)).toBe('start');
  });
});

describe('blockSummary', () => {
  it('zählt nur linke Durchgänge mit Reiz', () => {
    const recs = [
      sampleRecord({ kind: 'left', outcome: 'hit' }),
      sampleRecord({ kind: 'left', outcome: 'miss' }),
      sampleRecord({ kind: 'left', outcome: 'anticipation' }),
      sampleRecord({ kind: 'right', outcome: 'hit' }),
      sampleRecord({ kind: 'catch', outcome: 'correctRejection' }),
      sampleRecord({ kind: 'left', outcome: 'aborted' }),
    ];
    expect(blockSummary(recs)).toEqual({ found: 1, total: 3 });
  });
});
