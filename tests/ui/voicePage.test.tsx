// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render } from 'preact';
import type { AudioEngine } from '../../src/io/audio';
import type { startRecording } from '../../src/io/recorder';
import type { Voice } from '../../src/io/voice';
import { DEFAULT_SETTINGS, openDb } from '../../src/store/db';
import { NO_GERMAN_VOICE_TEXT } from '../../src/ui/admin/AdminHome';
import { VoicePage } from '../../src/ui/admin/VoicePage';

let n = 0;
const settle = () => new Promise((r) => setTimeout(r, 10));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const row = (root: Element, label: string) => root.querySelector<HTMLElement>(`section[aria-label="${label}"]`)!;
const button = (el: Element, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)!;
const has = (el: Element, text: string) => [...el.querySelectorAll('button')].some((b) => b.textContent === text);
const type = async (input: HTMLInputElement, v: string) => {
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
};

const BYTES = new Uint8Array([1, 2, 3, 4]).buffer;

function fakeVoice(local = true) {
  return {
    setTexts: vi.fn(),
    setRecordings: vi.fn(),
    say: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(),
    unlock: vi.fn(),
    hasLocalGermanVoice: () => local,
    onVoicesChanged: () => () => undefined,
  };
}

function fakeRec() {
  const tracks = { stopped: 0 };
  const startRec = vi.fn(async () => ({
    mimeType: 'audio/mp4',
    stop: async () => {
      tracks.stopped++;
      return { data: BYTES, mimeType: 'audio/mp4' };
    },
  }));
  return { startRec, tracks };
}

async function mount(opts: { local?: boolean; announcements?: Record<string, string>; mediaRecorder?: boolean } = {}) {
  if (opts.mediaRecorder !== false) {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (t: string) => t === 'audio/mp4' });
  } else {
    vi.stubGlobal('MediaRecorder', undefined);
  }
  const db = await openDb(`voice-page-${n++}`);
  await db.saveSettings({ ...DEFAULT_SETTINGS, announcements: opts.announcements ?? {} });
  const voice = fakeVoice(opts.local ?? true);
  const audio = { ensureRunning: vi.fn(() => Promise.resolve()), playClip: vi.fn(() => Promise.resolve()) };
  const { startRec, tracks } = fakeRec();
  const onChanged = vi.fn();
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(
    <VoicePage
      db={db}
      voice={voice as unknown as Voice}
      audio={audio as unknown as AudioEngine}
      onChanged={onChanged}
      startRec={startRec as unknown as typeof startRecording}
    />,
    root,
  );
  await until(() => !!row(root, 'Ende der Übung'));
  return { db, root, voice, audio, startRec, tracks, onChanged, unmount: () => render(null, root) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('VoicePage', () => {
  it('zeigt alle Ansagen mit Standardtext als Platzhalter und den Hinweis', async () => {
    const { root } = await mount();
    const labels = [...root.querySelectorAll('section[aria-label]')].map((s) => s.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Begrüßung',
      'Anleitung zu Beginn',
      'Pause beginnt',
      'Pause: weitermachen',
      'Ende der Übung',
      'Tageslimit erreicht',
      'Ermutigung',
    ]);
    expect(root.textContent).toContain(
      'Gibt es eine Aufnahme, wird sie statt der Stimme abgespielt. Zahlen in der Tagesrückmeldung spricht immer die Systemstimme.',
    );
    expect(row(root, 'Ende der Übung').querySelector('input')!.placeholder).toBe('Gut gemacht. Die Übung ist zu Ende.');
  });

  it('speichert nur abweichende, nicht leere Texte und meldet die Änderung', async () => {
    const { db, root, onChanged } = await mount();
    await type(row(root, 'Ende der Übung').querySelector('input')!, 'Prima, fertig.');
    await type(row(root, 'Begrüßung').querySelector('input')!, 'Hallo! Schön, dass du da bist.');
    await type(row(root, 'Ermutigung').querySelector('input')!, '   ');
    button(root, 'Texte speichern').click();
    await until(() => onChanged.mock.calls.length > 0);
    expect((await db.getSettings()).announcements).toEqual({ end: 'Prima, fertig.' });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('zeigt gespeicherte Texte und leert das Feld mit „Standard“', async () => {
    const { db, root } = await mount({ announcements: { end: 'Prima, fertig.' } });
    const input = row(root, 'Ende der Übung').querySelector('input')!;
    expect(input.value).toBe('Prima, fertig.');
    button(row(root, 'Ende der Übung'), 'Standard').click();
    await settle();
    expect(input.value).toBe('');
    button(root, 'Texte speichern').click();
    await until(() => root.textContent!.includes('Gespeichert'));
    expect((await db.getSettings()).announcements).toEqual({});
  });

  it('„Anhören“ spricht den Entwurf, ohne ihn der Stimme zu hinterlassen', async () => {
    const { root, voice } = await mount({ announcements: { end: 'Gespeichert.' } });
    await type(row(root, 'Ende der Übung').querySelector('input')!, 'Entwurf');
    button(row(root, 'Ende der Übung'), 'Anhören').click();
    await settle();
    expect(voice.setTexts).toHaveBeenNthCalledWith(1, expect.objectContaining({ end: 'Entwurf' }));
    expect(voice.say).toHaveBeenCalledWith('end');
    expect(voice.setTexts).toHaveBeenLastCalledWith({ end: 'Gespeichert.' });
    expect(voice.setTexts.mock.invocationCallOrder[0]!).toBeLessThan(voice.say.mock.invocationCallOrder[0]!);
    expect(voice.say.mock.invocationCallOrder[0]!).toBeLessThan(voice.setTexts.mock.invocationCallOrder[1]!);
  });

  it('„Anhören“: erst laufende Ansage abbrechen, dann im Klick Ton und Stimme freischalten, dann sprechen', async () => {
    const { root, voice, audio } = await mount();
    button(row(root, 'Ende der Übung'), 'Anhören').click();
    // synchron im Klick, vor jedem Warten
    expect(voice.cancel).toHaveBeenCalledTimes(1);
    expect(audio.ensureRunning).toHaveBeenCalledTimes(1);
    expect(voice.unlock).toHaveBeenCalledTimes(1);
    expect(voice.say).toHaveBeenCalledWith('end');
    const order = [
      voice.cancel.mock.invocationCallOrder[0]!,
      audio.ensureRunning.mock.invocationCallOrder[0]!,
      voice.unlock.mock.invocationCallOrder[0]!,
      voice.setTexts.mock.invocationCallOrder[0]!,
      voice.say.mock.invocationCallOrder[0]!,
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('bricht beim Verlassen der Seite eine laufende Ansage ab', async () => {
    const { voice, unmount } = await mount();
    voice.cancel.mockClear();
    unmount();
    expect(voice.cancel).toHaveBeenCalledTimes(1);
  });

  it('nimmt auf, hört zur Probe und speichert die Aufnahme', async () => {
    const { db, root, audio, startRec, onChanged } = await mount();
    const r = row(root, 'Begrüßung');
    button(r, 'Aufnehmen').click();
    await until(() => has(r, 'Stopp (max. 15 s)'));
    expect(startRec).toHaveBeenCalledTimes(1);
    button(r, 'Stopp (max. 15 s)').click();
    await until(() => has(r, 'Speichern'));
    button(r, 'Probe anhören').click();
    await until(() => audio.playClip.mock.calls.length > 0);
    expect(audio.ensureRunning).toHaveBeenCalled();
    expect(audio.playClip).toHaveBeenCalledWith(BYTES);
    button(r, 'Speichern').click();
    await until(() => r.textContent!.includes('Aufnahme gilt'));
    const recs = await db.listRecordings();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ key: 'greeting', mimeType: 'audio/mp4' });
    expect(new Uint8Array(recs[0]!.data)).toEqual(new Uint8Array(BYTES));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(has(r, 'Aufnahme anhören')).toBe(true);
    expect(has(r, 'Aufnahme löschen')).toBe(true);
  });

  it('verwirft eine Probeaufnahme, ohne etwas zu speichern', async () => {
    const { db, root } = await mount();
    const r = row(root, 'Begrüßung');
    button(r, 'Aufnehmen').click();
    await until(() => has(r, 'Stopp (max. 15 s)'));
    button(r, 'Stopp (max. 15 s)').click();
    await until(() => has(r, 'Verwerfen'));
    button(r, 'Verwerfen').click();
    await until(() => has(r, 'Aufnehmen'));
    expect(await db.listRecordings()).toEqual([]);
    expect(r.textContent).not.toContain('Aufnahme gilt');
  });

  it('zeigt vorhandene Aufnahmen, spielt und löscht sie', async () => {
    const { db, root, audio, onChanged } = await mount();
    await db.saveRecording({ key: 'end', mimeType: 'audio/mp4', data: BYTES, createdAtIso: '2026-10-01T10:00:00.000Z' });
    // Seite neu aufbauen, damit sie die Aufnahme lädt
    render(null, root);
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    render(<VoicePage db={db} voice={fakeVoice() as unknown as Voice} audio={audio as unknown as AudioEngine} onChanged={onChanged} />, root2);
    await until(() => !!row(root2, 'Ende der Übung') && row(root2, 'Ende der Übung').textContent!.includes('Aufnahme gilt'));
    const r = row(root2, 'Ende der Übung');
    button(r, 'Aufnahme anhören').click();
    await until(() => audio.playClip.mock.calls.length > 0);
    expect(audio.playClip).toHaveBeenCalledWith(BYTES);
    button(r, 'Aufnahme löschen').click();
    await until(() => !r.textContent!.includes('Aufnahme gilt'));
    expect(await db.listRecordings()).toEqual([]);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('warnt, wenn keine deutsche Stimme vorhanden ist', async () => {
    const { root } = await mount({ local: false });
    expect(root.textContent).toContain(NO_GERMAN_VOICE_TEXT);
  });

  it('zeigt die Warnung nicht, wenn eine Stimme da ist', async () => {
    const { root } = await mount({ local: true });
    expect(root.textContent).not.toContain(NO_GERMAN_VOICE_TEXT);
  });

  it('sperrt „Aufnehmen“ ohne MediaRecorder und sagt warum', async () => {
    const { root } = await mount({ mediaRecorder: false });
    expect(root.textContent).toContain('Aufnahmen werden von diesem Browser nicht unterstützt.');
    for (const b of [...root.querySelectorAll('button')].filter((x) => x.textContent === 'Aufnehmen')) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('beendet eine laufende Aufnahme beim Verlassen der Seite', async () => {
    const { root, tracks, unmount } = await mount();
    const r = row(root, 'Begrüßung');
    button(r, 'Aufnehmen').click();
    await until(() => has(r, 'Stopp (max. 15 s)'));
    unmount();
    await settle();
    expect(tracks.stopped).toBe(1);
  });

  it('meldet ein nicht verfügbares Mikrofon', async () => {
    const { root, startRec } = await mount();
    startRec.mockRejectedValueOnce(new Error('denied'));
    const r = row(root, 'Begrüßung');
    button(r, 'Aufnehmen').click();
    await until(() => r.textContent!.includes('Mikrofon'));
    expect(r.textContent).toContain('Das Mikrofon ist nicht verfügbar. Bitte den Zugriff erlauben.');
    expect(has(r, 'Aufnehmen')).toBe(true);
  });
});
