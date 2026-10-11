import { describe, it, expect, vi } from 'vitest';
import { AudioEngine, MASTER_GAIN_CAP, initialVolume } from '../../src/io/audio';

function param(value = 0) {
  return { value, setValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}
function node(extra: Record<string, unknown> = {}) {
  return { connect: vi.fn((n: unknown) => n), disconnect: vi.fn(), ...extra };
}

/** Minimaler Fake eines AudioContext; merkt sich erzeugte Gain-Knoten. */
function fakeContext(state: string) {
  const gains: Array<{ gain: ReturnType<typeof param> }> = [];
  const sources: Array<{ connect: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];
  const oscillators: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const ctx = {
    state,
    currentTime: 0,
    sampleRate: 48000,
    destination: node(),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createGain: vi.fn(() => {
      const g = node({ gain: param(1) }) as ReturnType<typeof node> & { gain: ReturnType<typeof param> };
      gains.push(g);
      return g;
    }),
    createDynamicsCompressor: vi.fn(() => node({ threshold: param(), ratio: param(), knee: param(), attack: param(), release: param() })),
    createBuffer: vi.fn((ch: number, len: number) => ({ getChannelData: () => new Float32Array(len), duration: len / 48000, numberOfChannels: ch })),
    createBufferSource: vi.fn(() => {
      const n = node({ buffer: null, start: vi.fn(), stop: vi.fn(), onended: null }) as unknown as (typeof sources)[number];
      sources.push(n);
      return n;
    }),
    createOscillator: vi.fn(() => {
      const n = node({ frequency: param(), type: 'sine', start: vi.fn(), stop: vi.fn() }) as unknown as (typeof oscillators)[number];
      oscillators.push(n);
      return n;
    }),
    createPanner: vi.fn(() => node({ positionX: param(), positionY: param(), positionZ: param() })),
    createStereoPanner: vi.fn(() => node({ pan: param() })),
    decodeAudioData: vi.fn(async (_data: ArrayBuffer) => ({ duration: 1 })),
  };
  return { ctx, gains, sources, oscillators };
}

describe('AudioEngine', () => {
  it.each(['interrupted', 'suspended'])('ensureRunning ruft resume bei %s', async (state) => {
    const { ctx } = fakeContext(state);
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('ensureRunning ruft resume nicht bei running', async () => {
    const { ctx } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it('Kontext wird nur einmal erzeugt, auch nach Unterbrechung', async () => {
    const { ctx } = fakeContext('running');
    const factory = vi.fn(() => ctx as unknown as AudioContext);
    const eng = new AudioEngine(factory);
    await eng.ensureRunning();
    ctx.state = 'interrupted';
    await eng.ensureRunning();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it('Lautstärke wird auf den Deckel geklemmt', async () => {
    const { ctx, gains } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    eng.apply({ outputMode: 'headphones', volume: 2, balance: 0 });
    expect(gains[0]!.gain.value).toBeCloseTo(MASTER_GAIN_CAP);
    eng.apply({ outputMode: 'headphones', volume: 0.5, balance: 0 });
    expect(gains[0]!.gain.value).toBeCloseTo(MASTER_GAIN_CAP * 0.5);
    eng.apply({ outputMode: 'headphones', volume: -1, balance: 0 });
    expect(gains[0]!.gain.value).toBe(0);
  });

  it('Einstellungen vor dem Start werden beim Start übernommen', async () => {
    const { ctx, gains } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    eng.apply({ outputMode: 'speakers', volume: 0.4, balance: 0 });
    await eng.ensureRunning();
    expect(gains[0]!.gain.value).toBeCloseTo(MASTER_GAIN_CAP * 0.4);
  });

  it('Kopfhörer nutzen HRTF-Panner, Lautsprecher StereoPanner', async () => {
    const { ctx } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    eng.apply({ outputMode: 'headphones', volume: 0.5, balance: 0 });
    eng.scheduleBurst({ pos: { side: 'L', eccDeg: 10, angleDeg: 0 }, gainDb: 0, atSec: 1, rampMs: 150, plateauMs: 300 });
    expect(ctx.createPanner).toHaveBeenCalledTimes(1);
    eng.apply({ outputMode: 'speakers', volume: 0.5, balance: 0 });
    eng.scheduleBurst({ pos: { side: 'L', eccDeg: 10, angleDeg: 0 }, gainDb: 0, atSec: 2, rampMs: 150, plateauMs: 300 });
    expect(ctx.createStereoPanner).toHaveBeenCalledTimes(1);
  });
});

describe('AudioEngine Abbruch des Tons (Spec 10: Ton endet spätestens 1 s nach dem Abbruch)', () => {
  const burst = { pos: { side: 'L' as const, eccDeg: 10, angleDeg: 0 }, gainDb: 0, rampMs: 150, plateauMs: 300 };

  it('cancelBursts stoppt alle geplanten Töne und blendet sie in ~20 ms aus', async () => {
    const { ctx, gains, sources } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    eng.scheduleBurst({ ...burst, atSec: 3 });
    eng.scheduleBurst({ ...burst, atSec: 4 });
    expect(sources).toHaveLength(2);
    // Gain-Knoten: [0] Master, danach je Ton Hüllkurve und Ausblendung
    const fades = [gains[2]!, gains[4]!];
    ctx.currentTime = 3.1;
    sources.forEach((s) => s.stop.mockClear());
    eng.cancelBursts();
    for (const s of sources) {
      expect(s.stop).toHaveBeenCalledTimes(1);
      const at = s.stop.mock.calls[0]![0] as number;
      expect(at).toBeGreaterThanOrEqual(3.1);
      expect(at).toBeLessThanOrEqual(3.1 + 0.05);
    }
    for (const f of fades) {
      expect(f.gain.cancelScheduledValues).toHaveBeenCalledWith(3.1);
      expect(f.gain.setTargetAtTime).toHaveBeenCalledTimes(1);
      const [target, at, tau] = f.gain.setTargetAtTime.mock.calls[0] as [number, number, number];
      expect([target, at]).toEqual([0, 3.1]);
      expect(tau * 4).toBeLessThanOrEqual(0.025); // ≈ 20 ms bis 98 %
    }
  });

  it('beendete Töne werden nicht mehr abgebrochen; ohne Töne und ohne Kontext ist cancelBursts folgenlos', async () => {
    const { ctx, sources } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    expect(() => eng.cancelBursts()).not.toThrow();
    await eng.ensureRunning();
    eng.scheduleBurst({ ...burst, atSec: 1 });
    sources[0]!.onended?.();
    sources[0]!.stop.mockClear();
    eng.cancelBursts();
    expect(sources[0]!.stop).not.toHaveBeenCalled();
    expect(() => eng.cancelBursts()).not.toThrow();
  });

  it('ein zweiter Aufruf bricht nichts doppelt ab', async () => {
    const { ctx, sources } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    eng.scheduleBurst({ ...burst, atSec: 1 });
    sources[0]!.stop.mockClear();
    eng.cancelBursts();
    eng.cancelBursts();
    expect(sources[0]!.stop).toHaveBeenCalledTimes(1);
  });

  it('playChime tut nichts, solange der Kontext nicht läuft (kein Aufstauen von Glocken)', async () => {
    const { ctx, oscillators } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    eng.playChime(); // noch kein Kontext
    await eng.ensureRunning();
    ctx.state = 'interrupted';
    eng.playChime();
    expect(oscillators).toHaveLength(0);
    ctx.state = 'running';
    eng.playChime();
    expect(oscillators).toHaveLength(2);
  });
});

describe('AudioEngine.playClip (Aufnahmen über Master und Limiter)', () => {
  it('dekodiert eine Kopie, verbindet die Quelle mit dem Master und erfüllt sich bei onended', async () => {
    const { ctx, gains, sources } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    const data = new Uint8Array([1, 2, 3, 4]).buffer;
    let settled = false;
    const p = eng.playClip(data).then(() => (settled = true));
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    const decoded = ctx.decodeAudioData.mock.calls[0]![0];
    expect(decoded).not.toBe(data);
    expect(decoded.byteLength).toBe(4);
    expect(data.byteLength).toBe(4);
    const src = sources[0]!;
    expect(src.connect).toHaveBeenCalledWith(gains[0]); // gains[0] ist der Master
    expect(src.start).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    src.onended?.();
    await p;
    expect(settled).toBe(true);
  });

  it('lehnt ab, solange der Kontext fehlt oder nicht läuft', async () => {
    const { ctx } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await expect(eng.playClip(new ArrayBuffer(4))).rejects.toThrow();
    await eng.ensureRunning();
    ctx.state = 'interrupted';
    await expect(eng.playClip(new ArrayBuffer(4))).rejects.toThrow();
    expect(ctx.decodeAudioData).not.toHaveBeenCalled();
  });

  it('lehnt ab, wenn die Dekodierung scheitert', async () => {
    const { ctx, sources } = fakeContext('running');
    ctx.decodeAudioData.mockRejectedValueOnce(new Error('bad data'));
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    await expect(eng.playClip(new ArrayBuffer(4))).rejects.toThrow('bad data');
    expect(sources).toHaveLength(0);
  });
});

describe('initialVolume', () => {
  it('höchstens 0,5', () => {
    expect(initialVolume(0.9)).toBe(0.5);
    expect(initialVolume(null)).toBe(0.5);
    expect(initialVolume(0.3)).toBe(0.3);
  });
});

describe('startupAudioSettings', () => {
  it('begrenzt die gespeicherte Lautstärke beim App-Start auf 50 %', async () => {
    const { startupAudioSettings } = await import('../../src/io/audio');
    expect(startupAudioSettings({ outputMode: 'speakers', volume: 1, balance: 0.2 })).toEqual({ outputMode: 'speakers', volume: 0.5, balance: 0.2 });
    expect(startupAudioSettings({ outputMode: 'headphones', volume: 0.3, balance: 0 }).volume).toBe(0.3);
  });
});

describe('AudioEngine Zustand und Latenz', () => {
  it('isRunning und Latenz aus base- plus outputLatency', async () => {
    const { ctx } = fakeContext('running');
    Object.assign(ctx, { baseLatency: 0.01, outputLatency: 0.04 });
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    expect(eng.isRunning()).toBe(false);
    expect(eng.outputLatencySec()).toBe(0);
    await eng.ensureRunning();
    expect(eng.isRunning()).toBe(true);
    expect(eng.outputLatencySec()).toBeCloseTo(0.05);
    ctx.state = 'interrupted';
    expect(eng.isRunning()).toBe(false);
  });
  it('fehlende Latenzangaben zählen als 0', async () => {
    const { ctx } = fakeContext('running');
    const eng = new AudioEngine(() => ctx as unknown as AudioContext);
    await eng.ensureRunning();
    expect(eng.outputLatencySec()).toBe(0);
  });
});

describe('Pegel (Nutzerbefund 11.10.: am PC kaum hörbar)', () => {
  it('Rauschen wird auf festen Effektivwert normiert, Spitzen bleiben in [-1, 1]', async () => {
    const { normalizeRms, NOISE_RMS } = await import('../../src/io/audio');
    const data = new Float32Array(48000);
    let x = 1;
    for (let i = 0; i < data.length; i++) {
      x = (x * 1103515245 + 12345) % 2147483648; // deterministisches Rauschen
      data[i] = (x / 2147483648 - 0.5) * 0.02;
    }
    normalizeRms(data, NOISE_RMS);
    let s = 0;
    let peak = 0;
    for (const v of data) {
      s += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    expect(Math.sqrt(s / data.length)).toBeCloseTo(NOISE_RMS, 2);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('bei Startlautstärke (50 %) etwa −18 dBFS effektiv, bei 100 % höchstens −12 dBFS vor dem Limiter', async () => {
    const { NOISE_RMS, MASTER_GAIN_CAP: cap } = await import('../../src/io/audio');
    const db = (x: number) => 20 * Math.log10(x);
    expect(db(NOISE_RMS * cap * 0.5)).toBeGreaterThan(-20);
    expect(db(NOISE_RMS * cap * 0.5)).toBeLessThan(-15);
    expect(db(NOISE_RMS * cap * 1)).toBeLessThanOrEqual(-12);
  });

  it('Glockenton deutlich, aber leiser als das Rauschen (Spitze ≈ −20 dBFS bei 50 %)', async () => {
    const { CHIME_PEAK, MASTER_GAIN_CAP: cap } = await import('../../src/io/audio');
    const db = 20 * Math.log10(CHIME_PEAK * cap * 0.5);
    expect(db).toBeGreaterThan(-23);
    expect(db).toBeLessThan(-17);
  });
});
