// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RECORDING_MAX_MS, RECORDING_MIME_CANDIDATES, pickRecordingMime, startRecording } from '../../src/io/recorder';

describe('pickRecordingMime', () => {
  it('Reihenfolge der Kandidaten', () => {
    expect(RECORDING_MIME_CANDIDATES).toEqual(['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']);
    expect(RECORDING_MAX_MS).toBe(15_000);
  });
  it('erster unterstützter Typ', () => {
    expect(pickRecordingMime((t) => t === 'audio/webm')).toBe('audio/webm');
    expect(pickRecordingMime(() => true)).toBe('audio/mp4');
  });
  it('ohne Unterstützung null', () => {
    expect(pickRecordingMime(() => false)).toBeNull();
  });
});

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static supported = new Set(['audio/webm']);
  static isTypeSupported = (t: string) => FakeRecorder.supported.has(t);
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])]) });
    this.ondataavailable?.({ data: new Blob([new Uint8Array([4, 5])]) });
    queueMicrotask(() => this.onstop?.());
  });
  constructor(public stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? '';
    FakeRecorder.instances.push(this);
  }
}

function fakeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks };
}

describe('startRecording', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecorder.instances = [];
    vi.stubGlobal('MediaRecorder', FakeRecorder);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('liefert gesammelte Daten und mimeType und beendet alle Spuren', async () => {
    const { stream, tracks } = fakeStream();
    const rec = await startRecording(async () => stream);
    expect(rec.mimeType).toBe('audio/webm');
    expect(FakeRecorder.instances[0]!.start).toHaveBeenCalled();
    const out = await rec.stop();
    expect(out.mimeType).toBe('audio/webm');
    expect([...new Uint8Array(out.data)]).toEqual([1, 2, 3, 4, 5]);
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });

  it('stoppt spätestens nach RECORDING_MAX_MS von selbst; stop danach liefert dasselbe Ergebnis', async () => {
    const { stream, tracks } = fakeStream();
    const rec = await startRecording(async () => stream);
    const r = FakeRecorder.instances[0]!;
    await vi.advanceTimersByTimeAsync(RECORDING_MAX_MS - 1);
    expect(r.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(r.stop).toHaveBeenCalledTimes(1);
    const out = await rec.stop();
    expect(out.data.byteLength).toBe(5);
    expect(r.stop).toHaveBeenCalledTimes(1);
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });

  it('manueller Stopp löscht den Zeitgeber', async () => {
    const { stream } = fakeStream();
    const rec = await startRecording(async () => stream);
    await rec.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('scheitert der Recorder beim Anlegen, werden die Spuren trotzdem beendet', async () => {
    const { stream, tracks } = fakeStream();
    vi.stubGlobal('MediaRecorder', class { static isTypeSupported = () => true; constructor() { throw new Error('nope'); } });
    await expect(startRecording(async () => stream)).rejects.toThrow('nope');
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });

  it('verweigertes Mikrofon: Fehler wird weitergereicht', async () => {
    await expect(startRecording(async () => { throw new Error('denied'); })).rejects.toThrow('denied');
  });
});
