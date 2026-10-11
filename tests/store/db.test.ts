import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { DEFAULT_TIMING } from '../../src/core/timing';
import { openDb, DEFAULT_SETTINGS, type MapSnapshot, type SessionRecord } from '../../src/store/db';
import { makeGeometry } from '../../src/core/geometry';
import { createControllerState } from '../../src/core/controller';
import { sampleRecord } from '../helpers/plans';

let n = 0;
const freshDb = () => openDb(`test-db-${n++}`);

const session = (id: string): SessionRecord => ({
  id,
  startedAtIso: '2026-10-11T10:00:00.000Z',
  endedAtIso: null,
  dayKey: '2026-10-11',
  kind: 'training',
  trialCount: 0,
  summary: null,
  stage: null,
});

const geo = makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 40, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820);

const snapshot = (sessionId: string, reason: MapSnapshot['reason'] = 'sessionEnd'): MapSnapshot => {
  const c = createControllerState(geo);
  return { id: `${sessionId}:${reason}`, sessionId, atIso: '2026-10-11T10:05:00.000Z', gridSignature: c.gridSignature, map: c.map, stage: '1', reason };
};

describe('Db', () => {
  it('leere DB liefert Standard-Einstellungen', async () => {
    const db = await freshDb();
    expect(await db.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('Standard-Einstellungen: Kopfhörer, halbe Lautstärke, kein Hinweis bestätigt', () => {
    expect(DEFAULT_SETTINGS.audio).toEqual({ outputMode: 'headphones', volume: 0.5, balance: 0 });
    expect(DEFAULT_SETTINGS.disclaimerAcceptedAt).toBeNull();
    expect(DEFAULT_SETTINGS.geometry).toBeNull();
  });

  it('Einstellungen speichern und lesen', async () => {
    const db = await freshDb();
    const s = {
      ...DEFAULT_SETTINGS,
      disclaimerAcceptedAt: '2026-10-11T09:00:00.000Z',
      geometry: { screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 },
    };
    await db.saveSettings(s);
    expect(await db.getSettings()).toEqual(s);
  });

  it('Sitzungen und Durchgänge, Filter nach Sitzung', async () => {
    const db = await freshDb();
    await db.addSession(session('s1'));
    await db.addSession(session('s2'));
    await db.addTrial(sampleRecord({ id: 's1-0', sessionId: 's1', index: 0 }));
    await db.addTrial(sampleRecord({ id: 's1-1', sessionId: 's1', index: 1 }));
    await db.addTrial(sampleRecord({ id: 's2-0', sessionId: 's2', index: 0 }));
    expect(await db.listSessions()).toHaveLength(2);
    expect((await db.listTrials('s1')).map((t) => t.id).sort()).toEqual(['s1-0', 's1-1']);
    expect(await db.listTrials()).toHaveLength(3);
  });

  it('updateSession überschreibt', async () => {
    const db = await freshDb();
    await db.addSession(session('s1'));
    await db.updateSession({ ...session('s1'), trialCount: 20, endedAtIso: '2026-10-11T10:05:00.000Z' });
    const [s] = await db.listSessions();
    expect(s!.trialCount).toBe(20);
  });

  it('clearAll leert alles', async () => {
    const db = await freshDb();
    await db.addSession(session('s1'));
    await db.addTrial(sampleRecord());
    await db.saveSettings({ ...DEFAULT_SETTINGS, disclaimerAcceptedAt: 'x' });
    await db.saveController(createControllerState(geo));
    await db.addMapSnapshot(snapshot('s1'));
    await db.clearAll();
    expect(await db.getController()).toBeNull();
    expect(await db.listMapSnapshots()).toEqual([]);
    expect(await db.listSessions()).toEqual([]);
    expect(await db.listTrials()).toEqual([]);
    expect(await db.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('Settings.setupViewport', () => {
  it('Standard ist null, alte Einstellungen ohne Feld bekommen null', async () => {
    expect(DEFAULT_SETTINGS.setupViewport).toBeNull();
    const db = await openDb(`test-db-${n++}`);
    const { setupViewport: _omit, ...old } = DEFAULT_SETTINGS;
    await db.saveSettings(old as typeof DEFAULT_SETTINGS);
    expect((await db.getSettings()).setupViewport).toBeNull();
  });
});

describe('Settings.timing', () => {
  it('Standard ist DEFAULT_TIMING, alte Einstellungen ohne Feld bekommen es', async () => {
    expect(DEFAULT_SETTINGS.timing).toEqual(DEFAULT_TIMING);
    const db = await openDb(`test-db-${n++}`);
    const { timing: _omit, ...old } = DEFAULT_SETTINGS;
    await db.saveSettings(old as typeof DEFAULT_SETTINGS);
    expect((await db.getSettings()).timing).toEqual(DEFAULT_TIMING);
  });

  it('gespeichertes Timing bleibt erhalten, unvollständiges wird aufgefüllt', async () => {
    const db = await openDb(`test-db-${n++}`);
    const timing = { plateauMs: 900, waitMinMs: 2000, waitMaxMs: 4000, responseWindowMinMs: 3000 };
    await db.saveSettings({ ...DEFAULT_SETTINGS, timing });
    expect((await db.getSettings()).timing).toEqual(timing);
    await db.saveSettings({ ...DEFAULT_SETTINGS, timing: { plateauMs: 900 } as typeof timing });
    expect((await db.getSettings()).timing).toEqual({ ...DEFAULT_TIMING, plateauMs: 900 });
  });
});

describe('Controller-Zustand und Karten-Snapshots', () => {
  it('leere DB: kein Controller, keine Snapshots', async () => {
    const db = await freshDb();
    expect(await db.getController()).toBeNull();
    expect(await db.listMapSnapshots()).toEqual([]);
  });

  it('Controller speichern, lesen und überschreiben', async () => {
    const db = await freshDb();
    const c = createControllerState(geo);
    await db.saveController(c);
    expect(await db.getController()).toEqual(c);
    const c2 = { ...c, sessionCount: 3 };
    await db.saveController(c2);
    expect(await db.getController()).toEqual(c2);
  });

  it('Snapshots anlegen und listen', async () => {
    const db = await freshDb();
    await db.addMapSnapshot(snapshot('s1'));
    await db.addMapSnapshot(snapshot('s2', 'gridChanged'));
    const list = await db.listMapSnapshots();
    expect(list.map((s) => s.sessionId).sort()).toEqual(['s1', 's2']);
    expect(list.find((s) => s.sessionId === 's2')!.reason).toBe('gridChanged');
    expect(list.find((s) => s.sessionId === 's1')!.map).toEqual(snapshot('s1').map);
  });

  it('zwei Snapshots einer Sitzung mit verschiedenem Grund bleiben beide erhalten', async () => {
    const db = await freshDb();
    await db.addMapSnapshot(snapshot('s1', 'gridChanged'));
    await db.addMapSnapshot(snapshot('s1', 'sessionEnd'));
    const list = await db.listMapSnapshots();
    expect(list.map((s) => s.id).sort()).toEqual(['s1:gridChanged', 's1:sessionEnd']);
  });

  it('derselbe Snapshot zweimal gespeichert ergibt einen (idempotent, letzter gilt)', async () => {
    const db = await freshDb();
    await db.addMapSnapshot(snapshot('s1'));
    await db.addMapSnapshot({ ...snapshot('s1'), atIso: '2026-10-11T11:00:00.000Z' });
    const list = await db.listMapSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0]!.atIso).toBe('2026-10-11T11:00:00.000Z');
  });

  it('Sitzungen mit Zusammenfassung und Stufe bleiben erhalten', async () => {
    const db = await freshDb();
    const summary = { stage: '2' as const, durationMin: 12, meanLeftLevel: 5.5, leftHitRate: 0.9 };
    await db.addSession({ ...session('s1'), summary, stage: '2' });
    const [s] = await db.listSessions();
    expect(s!.summary).toEqual(summary);
    expect(s!.stage).toBe('2');
  });

  it('listSessions füllt fehlende Felder alter Datensätze mit null', async () => {
    const db = await freshDb();
    const { summary: _s, stage: _t, ...old } = session('s1');
    await db.addSession(old as SessionRecord);
    const [s] = await db.listSessions();
    expect(s!.summary).toBeNull();
    expect(s!.stage).toBeNull();
  });
});
