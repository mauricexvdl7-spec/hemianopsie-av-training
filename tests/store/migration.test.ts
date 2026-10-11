import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openDB } from 'idb';
import { openDb, DB_VERSION } from '../../src/store/db';
import { sampleRecord } from '../helpers/plans';

let n = 0;

/** Legt eine Datenbank genau im Schema der Version 1 (M1) an. */
async function createV1(name: string): Promise<void> {
  const v1 = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('settings');
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('dayKey', 'dayKey');
      db.createObjectStore('trials', { keyPath: 'id' }).createIndex('sessionId', 'sessionId');
    },
  });
  await v1.put('settings', { disclaimerAcceptedAt: '2026-10-01T09:00:00.000Z' }, 'main');
  await v1.add('sessions', {
    id: 's1',
    startedAtIso: '2026-10-01T10:00:00.000Z',
    endedAtIso: '2026-10-01T10:12:00.000Z',
    dayKey: '2026-10-01',
    kind: 'training',
    trialCount: 1,
  });
  await v1.add('trials', sampleRecord({ id: 's1-0', sessionId: 's1' }));
  v1.close();
}

describe('Migration v1 -> v2', () => {
  it('Schema-Version ist 2', () => {
    expect(DB_VERSION).toBe(2);
  });

  it('vorhandene Daten bleiben, neue Felder sind leer', async () => {
    const name = `migration-db-${n++}`;
    await createV1(name);
    const db = await openDb(name);
    expect((await db.getSettings()).disclaimerAcceptedAt).toBe('2026-10-01T09:00:00.000Z');
    const sessions = await db.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe('s1');
    expect(sessions[0]!.trialCount).toBe(1);
    expect(sessions[0]!.summary).toBeNull();
    expect(sessions[0]!.stage).toBeNull();
    expect((await db.listTrials()).map((t) => t.id)).toEqual(['s1-0']);
    expect((await db.listTrials('s1')).map((t) => t.id)).toEqual(['s1-0']);
    expect(await db.getController()).toBeNull();
    expect(await db.listMapSnapshots()).toEqual([]);
  });

  it('nach der Migration sind die neuen Speicher benutzbar', async () => {
    const name = `migration-db-${n++}`;
    await createV1(name);
    const db = await openDb(name);
    await db.saveController({ version: 1 } as never);
    expect(await db.getController()).toEqual({ version: 1 });
    await db.clearAll();
    expect(await db.getController()).toBeNull();
    expect(await db.listSessions()).toEqual([]);
  });
});
