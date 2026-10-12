/**
 * Ansagen im Bereich für Angehörige: Texte ändern, anhören und eigene Aufnahmen machen.
 * Eine gespeicherte Aufnahme wird im Training statt der Systemstimme abgespielt.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AudioEngine } from '../../io/audio';
import { pickRecordingMime, RECORDING_MAX_MS, startRecording, type ActiveRecording } from '../../io/recorder';
import { ANNOUNCEMENT_KEYS, DEFAULT_ANNOUNCEMENTS, type AnnouncementKey, type Voice } from '../../io/voice';
import type { Db } from '../../store/db';
import { unlockAudio } from '../unlockAudio';
import { NO_GERMAN_VOICE_TEXT } from './AdminHome';

type Texts = Partial<Record<AnnouncementKey, string>>;
type Clip = { data: ArrayBuffer; mimeType: string };

const LABELS: Record<AnnouncementKey, string> = {
  greeting: 'Begrüßung',
  instruction: 'Anleitung zu Beginn',
  pauseStart: 'Pause beginnt',
  pauseReady: 'Pause: weitermachen',
  end: 'Ende der Übung',
  dailyLimit: 'Tageslimit erreicht',
  encouragement: 'Ermutigung',
};

const NOT_SUPPORTED = 'Aufnahmen werden von diesem Browser nicht unterstützt.';
const NO_MIC = 'Das Mikrofon ist nicht verfügbar. Bitte den Zugriff erlauben.';
const NO_PLAYBACK = 'Die Wiedergabe ist nicht möglich.';

const recordingSupported = () => pickRecordingMime((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) !== null;

/** Nur Texte, die nicht leer sind und vom Standard abweichen. */
function differing(drafts: Texts): Texts {
  const out: Texts = {};
  for (const key of ANNOUNCEMENT_KEYS) {
    const text = drafts[key]?.trim();
    if (text && text !== DEFAULT_ANNOUNCEMENTS[key]) out[key] = text;
  }
  return out;
}

type Phase = 'idle' | 'starting' | 'recording' | 'review';

function AnnouncementRow(props: {
  announcement: AnnouncementKey;
  draft: string;
  saved: Clip | undefined;
  canRecord: boolean;
  otherBusy: boolean;
  audio: AudioEngine;
  startRec: typeof startRecording;
  onDraft(text: string): void;
  onListen(): void;
  onBusy(busy: boolean): void;
  onSaveClip(clip: Clip): Promise<void>;
  onDeleteClip(): Promise<void>;
}) {
  const label = LABELS[props.announcement];
  const [phase, setPhase] = useState<Phase>('idle');
  const [clip, setClip] = useState<Clip | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const active = useRef<ActiveRecording | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  // Beim Verlassen der Seite laufende Aufnahme beenden und das Mikrofon freigeben
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      active.current?.stop().catch(() => undefined);
      active.current = null;
    };
  }, []);

  const play = async (data: ArrayBuffer) => {
    setNote(null);
    try {
      // Innerhalb des Klicks starten; erst danach darf gewartet werden
      await props.audio.ensureRunning();
      await props.audio.playClip(data);
    } catch {
      if (alive.current) setNote(NO_PLAYBACK);
    }
  };

  const finish = async () => {
    const rec = active.current;
    if (!rec) return;
    active.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    try {
      const result = await rec.stop();
      if (!alive.current) return;
      setClip(result);
      setPhase('review');
    } catch {
      if (!alive.current) return;
      setNote(NO_MIC);
      setPhase('idle');
      props.onBusy(false);
    }
  };

  const begin = async () => {
    setNote(null);
    setPhase('starting');
    props.onBusy(true);
    try {
      const rec = await props.startRec();
      if (!alive.current) {
        rec.stop().catch(() => undefined);
        return;
      }
      active.current = rec;
      setPhase('recording');
      timer.current = setTimeout(() => void finish(), RECORDING_MAX_MS);
    } catch {
      if (!alive.current) return;
      setNote(NO_MIC);
      setPhase('idle');
      props.onBusy(false);
    }
  };

  const discard = () => {
    setClip(null);
    setPhase('idle');
    props.onBusy(false);
  };

  const keep = async () => {
    if (!clip) return;
    try {
      await props.onSaveClip(clip);
    } catch {
      if (alive.current) setNote('Die Aufnahme konnte nicht gespeichert werden.');
      return;
    }
    if (alive.current) discard();
  };

  const remove = async () => {
    try {
      await props.onDeleteClip();
      if (alive.current) setNote(null);
    } catch {
      if (alive.current) setNote('Die Aufnahme konnte nicht gelöscht werden.');
    }
  };

  return (
    <section class="card announcement" aria-label={label}>
      <h2>{label}</h2>
      <input
        type="text"
        class="announcement-text"
        aria-label={`Text: ${label}`}
        placeholder={DEFAULT_ANNOUNCEMENTS[props.announcement]}
        value={props.draft}
        onInput={(e) => props.onDraft(e.currentTarget.value)}
      />
      <div class="actions">
        <button onClick={() => props.onDraft('')}>Standard</button>
        <button onClick={() => props.onListen()}>Anhören</button>
      </div>

      <div class="actions">
        {phase === 'idle' && (
          <button disabled={!props.canRecord || props.otherBusy} onClick={() => void begin()}>
            Aufnehmen
          </button>
        )}
        {phase === 'starting' && <button disabled>Aufnehmen</button>}
        {phase === 'recording' && <button onClick={() => void finish()}>Stopp (max. 15 s)</button>}
        {phase === 'review' && clip && (
          <>
            <button onClick={() => void play(clip.data)}>Probe anhören</button>
            <button class="primary" onClick={() => void keep()}>
              Speichern
            </button>
            <button onClick={discard}>Verwerfen</button>
          </>
        )}
      </div>

      {props.saved && (
        <>
          <p>Aufnahme gilt</p>
          <div class="actions">
            <button onClick={() => void play(props.saved!.data)}>Aufnahme anhören</button>
            <button onClick={() => void remove()}>Aufnahme löschen</button>
          </div>
        </>
      )}
      {note && <p class="error">{note}</p>}
    </section>
  );
}

export function VoicePage(props: { db: Db; voice: Voice; audio: AudioEngine; onChanged(): void; startRec?: typeof startRecording }) {
  const startRec = props.startRec ?? startRecording;
  const [loaded, setLoaded] = useState(false);
  const [savedTexts, setSavedTexts] = useState<Texts>({});
  const [drafts, setDrafts] = useState<Texts>({});
  const [clips, setClips] = useState<ReadonlyMap<AnnouncementKey, Clip>>(new Map());
  const [busy, setBusy] = useState<AnnouncementKey | null>(null);
  const [hasVoice, setHasVoice] = useState(() => props.voice.hasLocalGermanVoice());
  const [note, setNote] = useState<string | null>(null);
  const canRecord = recordingSupported();

  useEffect(() => {
    let alive = true;
    Promise.all([props.db.getSettings(), props.db.listRecordings()])
      .then(([s, recs]) => {
        if (!alive) return;
        setSavedTexts(s.announcements);
        setDrafts(s.announcements);
        setClips(new Map(recs.map((r) => [r.key, { data: r.data, mimeType: r.mimeType }])));
        setLoaded(true);
      })
      .catch(() => alive && setNote('Die Ansagen konnten nicht geladen werden.'));
    return () => {
      alive = false;
    };
  }, [props.db]);

  // Die Stimmenliste kommt auf iOS oft erst nach dem ersten Zeichnen
  useEffect(() => {
    setHasVoice(props.voice.hasLocalGermanVoice());
    return props.voice.onVoicesChanged(() => setHasVoice(props.voice.hasLocalGermanVoice()));
  }, [props.voice]);

  const saveTexts = async () => {
    try {
      const announcements = differing(drafts);
      await props.db.saveSettings({ ...(await props.db.getSettings()), announcements });
      setSavedTexts(announcements);
      setNote('Gespeichert. Gilt ab der nächsten Sitzung.');
      props.onChanged();
    } catch {
      setNote('Die Texte konnten nicht gespeichert werden.');
    }
  };

  // Beim Verlassen der Seite nicht weitersprechen
  useEffect(() => () => props.voice.cancel(), [props.voice]);

  /** Entwurf nur für diese Ansage aufsetzen; die gespeicherten Texte bleiben danach die der Stimme. */
  const listen = (key: AnnouncementKey) => {
    // Laufende Ansage abbrechen, dann synchron im Klick Ton (für Aufnahmen) und Stimme freischalten (iOS)
    props.voice.cancel();
    unlockAudio(props.audio);
    props.voice.unlock();
    props.voice.setTexts(drafts);
    void props.voice.say(key);
    props.voice.setTexts(savedTexts);
  };

  const saveClip = async (key: AnnouncementKey, clip: Clip) => {
    await props.db.saveRecording({ key, mimeType: clip.mimeType, data: clip.data, createdAtIso: new Date().toISOString() });
    setClips((m) => new Map(m).set(key, clip));
    props.onChanged();
  };

  const deleteClip = async (key: AnnouncementKey) => {
    await props.db.deleteRecording(key);
    setClips((m) => {
      const next = new Map(m);
      next.delete(key);
      return next;
    });
    props.onChanged();
  };

  return (
    <div class="admin screen">
      <div class="admin-inner">
        <div class="actions back">
          <button onClick={() => (location.hash = '#/admin')}>Zurück</button>
        </div>

        <section class="card">
          <h1>Ansagen</h1>
          <p class="hint">
            Gibt es eine Aufnahme, wird sie statt der Stimme abgespielt. Zahlen in der Tagesrückmeldung spricht immer die Systemstimme.
          </p>
          {!canRecord && <p class="hint">{NOT_SUPPORTED}</p>}
          <div class="actions">
            <button class="primary" disabled={!loaded} onClick={() => void saveTexts()}>
              Texte speichern
            </button>
          </div>
          {note && <p>{note}</p>}
        </section>

        {!hasVoice && (
          <section class="card notice">
            <p>{NO_GERMAN_VOICE_TEXT}</p>
          </section>
        )}

        {loaded &&
          ANNOUNCEMENT_KEYS.map((key) => (
            <AnnouncementRow
              key={key}
              announcement={key}
              draft={drafts[key] ?? ''}
              saved={clips.get(key)}
              canRecord={canRecord}
              otherBusy={busy !== null && busy !== key}
              audio={props.audio}
              startRec={startRec}
              onDraft={(text) => {
                setNote(null);
                setDrafts((d) => ({ ...d, [key]: text }));
              }}
              onListen={() => listen(key)}
              onBusy={(b) => setBusy(b ? key : null)}
              onSaveClip={(clip) => saveClip(key, clip)}
              onDeleteClip={() => deleteClip(key)}
            />
          ))}
      </div>
    </div>
  );
}
