import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDb, DEFAULT_SETTINGS, type MapSnapshot, type SessionRecord } from '../../src/store/db';
import { makeGeometry } from '../../src/core/geometry';
import { createControllerState } from '../../src/core/controller';
import { exportAll, importAll, trialsToCsv, EXPORT_SCHEMA, CSV_COLUMNS } from '../../src/store/exportData';
import { sampleRecord } from '../helpers/plans';

let n = 0;
const freshDb = () => openDb(`export-db-${n++}`);

const geo = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 40, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820);
const sess = (id: string): SessionRecord => ({
  id, startedAtIso: 'a', endedAtIso: 'b', dayKey: '2026-10-11', kind: 'training', trialCount: 0, summary: null, stage: null,
});
const snap = (sessionId: string, reason: MapSnapshot['reason'] = 'sessionEnd'): MapSnapshot => {
  const c = createControllerState(geo);
  return { id: `${sessionId}:${reason}`, sessionId, atIso: '2026-10-11T10:05:00.000Z', gridSignature: c.gridSignature, map: c.map, stage: '1', reason };
};

const HEADER =
  'id;sessionId;index;startedAtIso;kind;side;eccDeg;angleDeg;gridPointId;level;contrast;sigmaDeg;sound;soaMs;soundGainDb;waitMs;responseWindowMs;phase;outcome;rtMs;soundPlayed;stairBefore;stairAfter;fixationOk;abortReason';

describe('Export und Import', () => {
  it('Runde ohne Verlust', async () => {
    const a = await freshDb();
    await a.saveSettings({ ...DEFAULT_SETTINGS, disclaimerAcceptedAt: '2026-10-11T09:00:00.000Z' });
    await a.addSession({ ...sess('s1'), trialCount: 2 });
    await a.addTrial(sampleRecord({ id: 's1-0', sessionId: 's1' }));
    await a.addTrial(sampleRecord({ id: 's1-1', sessionId: 's1', index: 1, outcome: 'miss', rtMs: null }));
    const bundle = await exportAll(a, '2026-10-11T12:00:00.000Z');
    expect(bundle.schema).toBe(EXPORT_SCHEMA);

    const b = await freshDb();
    await b.addTrial(sampleRecord({ id: 'alt', sessionId: 'alt' }));
    const res = await importAll(b, JSON.parse(JSON.stringify(bundle)));
    expect(res).toEqual({ sessions: 1, trials: 2 });
    expect(await b.listSessions()).toEqual(await a.listSessions());
    const sortById = <T extends { id: string }>(xs: T[]) => [...xs].sort((x, y) => x.id.localeCompare(y.id));
    expect(sortById(await b.listTrials())).toEqual(sortById(await a.listTrials()));
    expect(await b.getSettings()).toEqual(await a.getSettings());
  });

  it('scheitert der Import mittendrin, bleiben die alten Daten vollständig erhalten', async () => {
    const db = await freshDb();
    await db.addSession({ ...sess('alt'), endedAtIso: null, dayKey: '2026-10-10', trialCount: 1 });
    await db.addTrial(sampleRecord({ id: 'alt-0', sessionId: 'alt' }));
    const controller = { ...createControllerState(geo), sessionCount: 4 };
    await db.saveController(controller);
    await db.addMapSnapshot(snap('alt'));
    const bad = {
      schema: EXPORT_SCHEMA,
      exportedAtIso: 'x',
      settings: DEFAULT_SETTINGS,
      controller: createControllerState(geo),
      mapSnapshots: [snap('neu')],
      sessions: [],
      trials: [sampleRecord({ id: 'neu-0' }), sampleRecord({ id: 'neu-0' })], // doppelte ID
    };
    await expect(importAll(db, bad)).rejects.toThrow();
    expect((await db.listTrials()).map((t) => t.id)).toEqual(['alt-0']);
    expect(await db.listSessions()).toHaveLength(1);
    expect(await db.getController()).toEqual(controller);
    expect((await db.listMapSnapshots()).map((s) => s.id)).toEqual(['alt:sessionEnd']);
  });

  it('scheitert der Import erst bei den Snapshots (doppelte ID), bleibt alles beim Alten', async () => {
    const db = await freshDb();
    await db.addSession({ ...sess('alt'), endedAtIso: null });
    const controller = { ...createControllerState(geo), sessionCount: 4 };
    await db.saveController(controller);
    await db.addMapSnapshot(snap('alt'));
    const bad = {
      schema: EXPORT_SCHEMA,
      exportedAtIso: 'x',
      settings: DEFAULT_SETTINGS,
      sessions: [sess('neu')],
      trials: [],
      controller: null,
      mapSnapshots: [snap('neu'), snap('neu')],
    };
    await expect(importAll(db, bad)).rejects.toThrow();
    expect((await db.listSessions()).map((s) => s.id)).toEqual(['alt']);
    expect(await db.getController()).toEqual(controller);
    expect((await db.listMapSnapshots()).map((s) => s.id)).toEqual(['alt:sessionEnd']);
  });

  it('Datensätze ohne ID werden vor dem Löschen abgelehnt', async () => {
    const db = await freshDb();
    await db.addTrial(sampleRecord({ id: 'alt-0', sessionId: 'alt' }));
    const bad = { schema: EXPORT_SCHEMA, exportedAtIso: 'x', settings: DEFAULT_SETTINGS, sessions: [{}], trials: [], controller: null, mapSnapshots: [] };
    await expect(importAll(db, bad)).rejects.toThrow(/Format/);
    expect(await db.listTrials()).toHaveLength(1);
  });

  it('Runde ohne Verlust inklusive Controller und Snapshots', async () => {
    const a = await freshDb();
    const controller = { ...createControllerState(geo), sessionCount: 2 };
    const summary = { stage: '1' as const, durationMin: 11, meanLeftLevel: 6, leftHitRate: 0.8 };
    await a.saveController(controller);
    await a.addSession({ ...sess('s1'), summary, stage: '1' });
    await a.addMapSnapshot(snap('s1', 'gridChanged'));
    await a.addMapSnapshot(snap('s1'));
    const bundle = await exportAll(a, '2026-10-11T12:00:00.000Z');
    expect(bundle.schema).toBe('sehtraining-export/2');
    expect(bundle.controller).toEqual(controller);
    expect(bundle.mapSnapshots).toHaveLength(2);

    const b = await freshDb();
    await b.saveController(createControllerState(geo));
    await b.addMapSnapshot(snap('alt'));
    await importAll(b, JSON.parse(JSON.stringify(bundle)));
    expect((await b.listMapSnapshots()).map((m) => m.id).sort()).toEqual(['s1:gridChanged', 's1:sessionEnd']);
    expect(await b.getController()).toEqual(controller);
    expect(await b.listMapSnapshots()).toEqual(await a.listMapSnapshots());
    expect(await b.listSessions()).toEqual(await a.listSessions());
  });

  it('Sicherung der Version 1 wird importiert: Controller null, keine Snapshots', async () => {
    const db = await freshDb();
    await db.saveController(createControllerState(geo));
    await db.addMapSnapshot(snap('alt'));
    const { summary: _s, stage: _t, ...oldSession } = sess('s1');
    const v1 = {
      schema: 'sehtraining-export/1',
      exportedAtIso: 'x',
      settings: { ...DEFAULT_SETTINGS, disclaimerAcceptedAt: '2026-10-01T09:00:00.000Z' },
      sessions: [oldSession],
      trials: [sampleRecord({ id: 's1-0', sessionId: 's1' })],
    };
    expect(await importAll(db, v1)).toEqual({ sessions: 1, trials: 1 });
    expect(await db.getController()).toBeNull();
    expect(await db.listMapSnapshots()).toEqual([]);
    const [s] = await db.listSessions();
    expect(s!.id).toBe('s1');
    expect(s!.summary).toBeNull();
    expect(s!.stage).toBeNull();
    expect((await db.getSettings()).disclaimerAcceptedAt).toBe('2026-10-01T09:00:00.000Z');
  });

  it('Version 2 mit ungültigem Controller oder Snapshots wird abgelehnt', async () => {
    const db = await freshDb();
    await db.addTrial(sampleRecord({ id: 'alt-0', sessionId: 'alt' }));
    const base = { schema: EXPORT_SCHEMA, exportedAtIso: 'x', settings: DEFAULT_SETTINGS, sessions: [], trials: [] };
    await expect(importAll(db, { ...base, mapSnapshots: [] })).rejects.toThrow(/Format/); // controller fehlt
    await expect(importAll(db, { ...base, controller: 5, mapSnapshots: [] })).rejects.toThrow(/Format/);
    await expect(importAll(db, { ...base, controller: {}, mapSnapshots: [] })).rejects.toThrow(/Format/);
    await expect(importAll(db, { ...base, controller: null })).rejects.toThrow(/Format/); // snapshots fehlen
    await expect(importAll(db, { ...base, controller: null, mapSnapshots: [{}] })).rejects.toThrow(/Format/);
    const { id: _id, ...noId } = snap('s1');
    await expect(importAll(db, { ...base, controller: null, mapSnapshots: [noId] })).rejects.toThrow(/Format/);
    const { sessionId: _sid, ...noSession } = snap('s1');
    await expect(importAll(db, { ...base, controller: null, mapSnapshots: [noSession] })).rejects.toThrow(/Format/);
    expect(await db.listTrials()).toHaveLength(1);
  });

  it('falsches Format wird abgelehnt', async () => {
    const db = await freshDb();
    await expect(importAll(db, { schema: 'x' })).rejects.toThrow(/Format/);
    await expect(importAll(db, null)).rejects.toThrow(/Format/);
  });
});

describe('trialsToCsv', () => {
  it('Kopfzeile enthält stairBefore;stairAfter', () => {
    expect(trialsToCsv([]).slice(1).split('\r\n')[0]).toContain('stairBefore;stairAfter');
  });

  it('Kopfzeile, BOM, Semikolon', () => {
    const csv = trialsToCsv([sampleRecord()]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')[0]).toBe(HEADER);
    expect(CSV_COLUMNS.join(';')).toBe(HEADER);
  });

  it('Werte in Spaltenreihenfolge, null leer, Dezimalpunkt', () => {
    const csv = trialsToCsv([sampleRecord({ rtMs: null, outcome: 'miss', contrast: 0.89 })]);
    const row = csv.slice(1).split('\r\n')[1]!.split(';');
    const col = (name: string) => row[CSV_COLUMNS.indexOf(name as (typeof CSV_COLUMNS)[number])];
    expect(col('side')).toBe('L');
    expect(col('eccDeg')).toBe('8');
    expect(col('rtMs')).toBe('');
    expect(col('fixationOk')).toBe('');
    expect(col('contrast')).toBe('0.89');
    expect(col('outcome')).toBe('miss');
  });

  it('Sonderzeichen werden gequotet', () => {
    const csv = trialsToCsv([sampleRecord({ abortReason: 'a;b"c' })]);
    expect(csv).toContain('"a;b""c"');
  });

  it('Durchgang ohne Reiz: Ortsspalten leer', () => {
    const csv = trialsToCsv([sampleRecord({ kind: 'catch', pos: null, gridPointId: null, level: null })]);
    const row = csv.slice(1).split('\r\n')[1]!.split(';');
    expect(row[CSV_COLUMNS.indexOf('side')]).toBe('');
    expect(row[CSV_COLUMNS.indexOf('eccDeg')]).toBe('');
  });
});
