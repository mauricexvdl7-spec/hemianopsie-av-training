// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ANNOUNCEMENT_KEYS,
  DEFAULT_ANNOUNCEMENTS,
  SPEECH_RATE,
  SPEECH_START_TIMEOUT_MS,
  Voice,
  pickGermanVoice,
  speechTimeoutMs,
  textFor,
  type SpeechLike,
  type VoiceDeps,
} from '../../src/io/voice';
import { RECORDING_MAX_MS } from '../../src/io/recorder';

const voice = (name: string, lang: string, localService: boolean) => ({ name, lang, localService });

describe('pickGermanVoice', () => {
  it('bevorzugt lokale de-DE-Stimme', () => {
    const r = pickGermanVoice([voice('Sam', 'en-US', true), voice('Remote', 'de-DE', false), voice('Anna', 'de-DE', true)]);
    expect(r?.voice.name).toBe('Anna');
    expect(r?.local).toBe(true);
  });
  it('nimmt sonst eine lokale deutsche Stimme', () => {
    const r = pickGermanVoice([voice('Hans', 'de-AT', true)]);
    expect(r).toEqual({ voice: voice('Hans', 'de-AT', true), local: true });
  });
  it('entfernte deutsche Stimme ist nicht lokal', () => {
    expect(pickGermanVoice([voice('Remote', 'de-DE', false)])?.local).toBe(false);
  });
  it('ohne deutsche Stimme null', () => {
    expect(pickGermanVoice([voice('Sam', 'en-US', true)])).toBeNull();
    expect(pickGermanVoice([])).toBeNull();
  });
});

describe('Texte', () => {
  it('Schlüssel in fester Reihenfolge, jeder mit Standardtext', () => {
    expect(ANNOUNCEMENT_KEYS).toEqual(['greeting', 'instruction', 'pauseStart', 'pauseReady', 'end', 'dailyLimit', 'encouragement']);
    for (const k of ANNOUNCEMENT_KEYS) expect(DEFAULT_ANNOUNCEMENTS[k].length).toBeGreaterThan(0);
    expect(DEFAULT_ANNOUNCEMENTS.greeting).toBe('Hallo! Schön, dass du da bist.');
  });
  it('textFor: leerer Text fällt auf den Standard zurück, eigener Text wird getrimmt', () => {
    expect(textFor('pauseStart', { pauseStart: '  ' })).toBe('Kurze Pause.');
    expect(textFor('end', { end: 'Fertig!' })).toBe('Fertig!');
    expect(textFor('end', { end: '  Fertig!  ' })).toBe('Fertig!');
    expect(textFor('end', {})).toBe('Gut gemacht. Die Übung ist zu Ende.');
  });
  it('speechTimeoutMs = 3000 + 120 · Zeichen', () => {
    expect(speechTimeoutMs('abcde')).toBe(3600);
    expect(speechTimeoutMs('')).toBe(3000);
  });
});

type Utt = {
  text: string;
  lang: string;
  rate: number;
  voice: unknown;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function setup(opts: { hang?: boolean; noStart?: boolean; voices?: ReturnType<typeof voice>[]; synth?: null; playClip?: VoiceDeps['playClip'] } = {}) {
  const spoken: Utt[] = [];
  const listeners = new Set<() => void>();
  const synth: SpeechLike = {
    speak: vi.fn((u: SpeechSynthesisUtterance) => {
      const x = u as unknown as Utt;
      spoken.push(x);
      if (!opts.noStart) queueMicrotask(() => x.onstart?.());
      if (!opts.hang && !opts.noStart) queueMicrotask(() => x.onend?.());
    }),
    cancel: vi.fn(),
    getVoices: () => (opts.voices ?? [voice('Anna', 'de-DE', true)]) as unknown as SpeechSynthesisVoice[],
    addEventListener: (_t, cb) => void listeners.add(cb),
    removeEventListener: (_t, cb) => void listeners.delete(cb),
  };
  const playClip = vi.fn(opts.playClip ?? (async () => undefined));
  const deps: VoiceDeps = {
    synth: opts.synth === null ? null : synth,
    makeUtterance: (text) => ({ text, lang: '', rate: 1, voice: null, onstart: null, onend: null, onerror: null }) as unknown as SpeechSynthesisUtterance,
    playClip,
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  };
  return { v: new Voice(deps), synth, spoken, playClip, listeners };
}

describe('Voice', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('say spricht den Standardtext mit Sprache, Tempo und Stimme und erfüllt sich bei onend', async () => {
    const { v, synth, spoken } = setup();
    await v.say('greeting');
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0]).toMatchObject({ text: 'Hallo! Schön, dass du da bist.', lang: 'de-DE', rate: SPEECH_RATE });
    expect(spoken[0]!.voice).toMatchObject({ name: 'Anna' });
    expect(SPEECH_RATE).toBe(0.9);
  });

  it('eigener Text aus setTexts wird gesprochen', async () => {
    const { v, spoken } = setup();
    v.setTexts({ greeting: 'Servus!' });
    await v.say('greeting');
    expect(spoken[0]!.text).toBe('Servus!');
  });

  it('Aufnahme hat Vorrang: playClip statt speak', async () => {
    const { v, synth, playClip } = setup();
    const data = new ArrayBuffer(8);
    v.setRecordings(new Map([['greeting', data]]));
    await v.say('greeting');
    expect(playClip).toHaveBeenCalledWith(data);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('scheitert die Wiedergabe, spricht die Systemstimme den Text', async () => {
    const { v, synth, spoken } = setup({ playClip: async () => { throw new Error('decode'); } });
    v.setRecordings(new Map([['greeting', new ArrayBuffer(8)]]));
    await v.say('greeting');
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0]!.text).toBe('Hallo! Schön, dass du da bist.');
  });

  it('hängt die Wiedergabe einer Aufnahme, erfüllt sich say nach RECORDING_MAX_MS + 2000', async () => {
    const { v } = setup({ playClip: () => new Promise<void>(() => undefined) });
    v.setRecordings(new Map([['end', new ArrayBuffer(8)]]));
    let done = false;
    void v.say('end').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(RECORDING_MAX_MS + 2000 - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('speakText nutzt auch bei vorhandenen Aufnahmen die Systemstimme', async () => {
    const { v, synth, playClip, spoken } = setup();
    v.setRecordings(new Map([['greeting', new ArrayBuffer(8)]]));
    await v.speakText('Heute 3 von 4 gefunden.');
    expect(playClip).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0]!.text).toBe('Heute 3 von 4 gefunden.');
  });

  it('hängende Stimme: erfüllt sich genau nach speechTimeoutMs', async () => {
    const { v } = setup({ hang: true });
    const text = DEFAULT_ANNOUNCEMENTS.greeting;
    const ms = speechTimeoutMs(text);
    let done = false;
    void v.say('greeting').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(ms - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Stimme beginnt nie (kein onstart): erfüllt sich nach SPEECH_START_TIMEOUT_MS und leert die Warteschlange', async () => {
    const { v, synth } = setup({ noStart: true });
    expect(SPEECH_START_TIMEOUT_MS).toBe(2500);
    let done = false;
    void v.say('instruction').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(SPEECH_START_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('hat die Stimme begonnen, gilt weiter die lange Zeitgrenze', async () => {
    const { v, synth } = setup({ hang: true });
    let done = false;
    void v.say('instruction').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(SPEECH_START_TIMEOUT_MS + 100);
    expect(done).toBe(false);
    expect(synth.cancel).not.toHaveBeenCalled();
  });

  it('onerror beendet die Ansage ebenfalls, und der Zeitgeber wird gelöscht', async () => {
    const { v, spoken } = setup({ hang: true });
    const p = v.say('end');
    spoken[0]!.onerror?.();
    await p;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('wirft speak, erfüllt sich say trotzdem', async () => {
    const { v, synth } = setup();
    (synth.speak as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('boom'); });
    await expect(v.say('end')).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ohne synth erfüllt sich say sofort; keine lokale Stimme', async () => {
    const { v } = setup({ synth: null });
    await v.say('greeting');
    await v.speakText('x');
    expect(v.hasLocalGermanVoice()).toBe(false);
    expect(() => v.unlock()).not.toThrow();
    expect(() => v.cancel()).not.toThrow();
  });

  it('unlock spricht synchron eine leere Äußerung', () => {
    const { v, synth, spoken } = setup();
    v.unlock();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0]!.text).toBe('');
  });

  it('cancel ruft synth.cancel; hasLocalGermanVoice nach Stimmenliste', () => {
    const a = setup();
    a.v.cancel();
    expect(a.synth.cancel).toHaveBeenCalled();
    expect(a.v.hasLocalGermanVoice()).toBe(true);
    expect(setup({ voices: [voice('R', 'de-DE', false)] }).v.hasLocalGermanVoice()).toBe(false);
  });

  it('ein zweites say bricht das erste nicht ab', async () => {
    const { v, synth } = setup();
    await Promise.all([v.say('greeting'), v.say('end')]);
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(2);
  });

  it('onVoicesChanged meldet an und ab', () => {
    const { v, listeners } = setup();
    const cb = vi.fn();
    const off = v.onVoicesChanged(cb);
    expect(listeners.size).toBe(1);
    [...listeners][0]!();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    expect(listeners.size).toBe(0);
  });
});
