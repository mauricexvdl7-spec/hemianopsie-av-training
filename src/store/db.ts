/** Lokale Speicherung in IndexedDB (Spec 12). Nichts verlässt das Gerät. */
import { openDB, type IDBPDatabase } from 'idb';
import type { ControllerState } from '../core/controller';
import type { GeometryInput } from '../core/geometry';
import type { MapState } from '../core/map';
import type { SessionSummary, Stage } from '../core/phases';
import type { TrialRecord } from '../core/types';
import type { AudioSettings } from '../io/audio';

export const DB_NAME = 'sehtraining';
export const DB_VERSION = 2;

export interface Settings {
  disclaimerAcceptedAt: string | null;
  geometry: GeometryInput | null;
  audio: AudioSettings;
  referenceRtsMs: number[];
  responseWindowMs: number | null;
  /** Fenstergröße (CSS-Pixel) bei der Einrichtung; die Bildbreite in cm gilt nur für genau diese Größe. */
  setupViewport: { width: number; height: number } | null;
}

export const DEFAULT_SETTINGS: Settings = {
  disclaimerAcceptedAt: null,
  geometry: null,
  audio: { outputMode: 'headphones', volume: 0.5, balance: 0 },
  referenceRtsMs: [],
  responseWindowMs: null,
  setupViewport: null,
};

/** Startwerte für die Geometrie im Einrichtungsassistenten. */
export const DEFAULT_GEOMETRY: GeometryInput = {
  screenWidthCm: 24,
  viewingDistanceCm: 30,
  fixationXFraction: 2 / 3,
  fixationYFraction: 0.5,
};

export interface SessionRecord {
  id: string;
  startedAtIso: string;
  endedAtIso: string | null;
  /** Lokales Datum YYYY-MM-DD. */
  dayKey: string;
  kind: 'training' | 'reference';
  trialCount: number;
  /** Zusammenfassung für die Phasenlogik; bei Datensätzen aus Version 1 fehlend (beim Lesen null). */
  summary?: SessionSummary | null;
  /** Trainingsstufe der Sitzung; bei Datensätzen aus Version 1 fehlend (beim Lesen null). */
  stage?: Stage | null;
}

/** Momentaufnahme der Schwellen-Karte; je Sitzung und Anlass höchstens eine (Schlüssel `id`). */
export interface MapSnapshot {
  /** `${sessionId}:${reason}` – so überschreibt der Sitzungsabschluss nie die alte Karte bei Rasterwechsel. */
  id: string;
  sessionId: string;
  atIso: string;
  gridSignature: string;
  map: MapState;
  stage: Stage;
  reason: 'sessionEnd' | 'gridChanged';
}

/** Alles, was `replaceAll` atomar ersetzt. */
export interface DbContents {
  settings: Settings;
  sessions: SessionRecord[];
  trials: TrialRecord[];
  controller: ControllerState | null;
  mapSnapshots: MapSnapshot[];
}

export interface Db {
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  addSession(s: SessionRecord): Promise<void>;
  updateSession(s: SessionRecord): Promise<void>;
  listSessions(): Promise<SessionRecord[]>;
  addTrial(t: TrialRecord): Promise<void>;
  listTrials(sessionId?: string): Promise<TrialRecord[]>;
  getController(): Promise<ControllerState | null>;
  saveController(s: ControllerState): Promise<void>;
  addMapSnapshot(s: MapSnapshot): Promise<void>;
  listMapSnapshots(): Promise<MapSnapshot[]>;
  clearAll(): Promise<void>;
  /** Ersetzt alle Daten in einer einzigen Transaktion: entweder alles oder nichts. */
  replaceAll(data: DbContents): Promise<void>;
}

const SETTINGS_KEY = 'main';
const CONTROLLER_KEY = 'main';
const STORES = ['settings', 'sessions', 'trials', 'controller', 'mapSnapshots'] as const;

/** Füllt Felder, die es in Version 1 noch nicht gab, mit null. */
const withSessionDefaults = (s: SessionRecord): SessionRecord => ({ ...s, summary: s.summary ?? null, stage: s.stage ?? null });

export async function openDb(name: string = DB_NAME): Promise<Db> {
  const idb: IDBPDatabase = await openDB(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('settings');
        db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('dayKey', 'dayKey');
        db.createObjectStore('trials', { keyPath: 'id' }).createIndex('sessionId', 'sessionId');
      }
      // Version 2: nur neue Speicher, vorhandene Daten bleiben unverändert.
      if (oldVersion < 2) {
        db.createObjectStore('controller');
        db.createObjectStore('mapSnapshots', { keyPath: 'id' });
      }
    },
  });

  return {
    async getSettings() {
      const s = (await idb.get('settings', SETTINGS_KEY)) as Settings | undefined;
      return s ? { ...DEFAULT_SETTINGS, ...s } : structuredClone(DEFAULT_SETTINGS);
    },
    async saveSettings(s) {
      await idb.put('settings', s, SETTINGS_KEY);
    },
    async addSession(s) {
      await idb.add('sessions', withSessionDefaults(s));
    },
    async updateSession(s) {
      await idb.put('sessions', withSessionDefaults(s));
    },
    async listSessions() {
      return ((await idb.getAll('sessions')) as SessionRecord[]).map(withSessionDefaults);
    },
    async addTrial(t) {
      await idb.add('trials', t);
    },
    async listTrials(sessionId) {
      const rows = sessionId === undefined ? await idb.getAll('trials') : await idb.getAllFromIndex('trials', 'sessionId', sessionId);
      return rows as TrialRecord[];
    },
    async getController() {
      return ((await idb.get('controller', CONTROLLER_KEY)) as ControllerState | undefined) ?? null;
    },
    async saveController(s) {
      await idb.put('controller', s, CONTROLLER_KEY);
    },
    async addMapSnapshot(s) {
      await idb.put('mapSnapshots', s);
    },
    async listMapSnapshots() {
      return (await idb.getAll('mapSnapshots')) as MapSnapshot[];
    },
    async clearAll() {
      const tx = idb.transaction([...STORES], 'readwrite');
      await Promise.all([...STORES.map((n) => tx.objectStore(n).clear()), tx.done]);
    },
    async replaceAll(data) {
      const tx = idb.transaction([...STORES], 'readwrite');
      const settings = tx.objectStore('settings');
      const sessions = tx.objectStore('sessions');
      const trials = tx.objectStore('trials');
      const controller = tx.objectStore('controller');
      const snapshots = tx.objectStore('mapSnapshots');
      try {
        await Promise.all([settings.clear(), sessions.clear(), trials.clear(), controller.clear(), snapshots.clear()]);
        await settings.put(data.settings, SETTINGS_KEY);
        for (const s of data.sessions) await sessions.add(withSessionDefaults(s));
        for (const t of data.trials) await trials.add(t);
        if (data.controller) await controller.put(data.controller, CONTROLLER_KEY);
        for (const m of data.mapSnapshots) await snapshots.add(m);
        await tx.done;
      } catch (e) {
        try {
          tx.abort();
        } catch {
          // Transaktion ist bereits abgebrochen
        }
        await tx.done.catch(() => undefined);
        throw e;
      }
    },
  };
}
