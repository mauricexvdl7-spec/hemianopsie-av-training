/**
 * Räumlicher Ton über Web Audio (Spec 6, 10).
 * Signalweg: Quelle → Hüllkurve → Panner → Master (gedeckelt) → Limiter → Ausgang.
 */
import { envelope } from '../core/stimulus';
import type { Side, VisualPos } from '../core/types';
import { dbToGain, stereoPan, visualToAzEl } from './spatial';

export type OutputMode = 'headphones' | 'speakers';

/** Linearer Deckel des Master-Gains, vor dem Limiter. */
export const MASTER_GAIN_CAP = 1;
/** Effektivwert des Rauschimpulses (≈ −12 dBFS); bei Startlautstärke 50 % ergibt das ≈ −18 dBFS. */
export const NOISE_RMS = 0.25;
/** Spitze des Glockentons; bei Startlautstärke 50 % ≈ −20 dBFS, leiser als der Reiz. */
export const CHIME_PEAK = 0.2;
const NOISE_SECONDS = 2;
const CURVE_POINTS = 128;
const RAD = Math.PI / 180;

export interface AudioSettings {
  outputMode: OutputMode;
  /** Anteil vom Deckel, 0..1. */
  volume: number;
  /** -1 (links) .. 1 (rechts). */
  balance: number;
}

/** Startlautstärke: gespeicherter Wert, höchstens 50 % des Deckels. */
export function initialVolume(saved: number | null): number {
  return Math.min(saved ?? 0.5, 0.5);
}

/** Beim App-Start: gespeicherte Einstellungen, Lautstärke höchstens 50 % des Deckels (Spec 10). */
export function startupAudioSettings(a: AudioSettings): AudioSettings {
  return { ...a, volume: initialVolume(a.volume) };
}

/** Skaliert ein Signal auf den gewünschten Effektivwert und begrenzt Spitzen auf ±1. */
export function normalizeRms(data: Float32Array, targetRms: number): void {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]! * data[i]!;
  const rms = Math.sqrt(sum / data.length);
  if (rms === 0) return;
  const k = targetRms / rms;
  for (let i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, data[i]! * k));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function defaultContext(): AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio wird nicht unterstützt.');
  return new Ctor();
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private settings: AudioSettings = { outputMode: 'headphones', volume: 0.5, balance: 0 };

  constructor(private readonly ctxFactory: () => AudioContext = defaultContext) {}

  /** Beim ersten Aufruf Kontext erzeugen; danach bei Unterbrechung (iOS: suspended/interrupted) fortsetzen. Nur aus einer Berührung heraus aufrufen. */
  async ensureRunning(): Promise<void> {
    if (!this.ctx) {
      const ctx = this.ctxFactory();
      const master = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 12;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.noise = this.makePinkNoise(ctx);
      this.applyMaster();
    }
    if ((this.ctx.state as string) !== 'running') await this.ctx.resume();
  }

  apply(settings: AudioSettings): void {
    this.settings = { ...settings, volume: clamp(settings.volume, 0, 1), balance: clamp(settings.balance, -1, 1) };
    this.applyMaster();
  }

  nowSec(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Nur bei laufendem Kontext steht die Audio-Uhr nicht still. */
  isRunning(): boolean {
    return (this.ctx?.state as string | undefined) === 'running';
  }

  /** Geschätzte Zeit vom Planen bis zum Klang am Ohr (Verarbeitung + Ausgabe, z. B. Bluetooth). */
  outputLatencySec(): number {
    if (!this.ctx) return 0;
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return (c.baseLatency || 0) + (c.outputLatency || 0);
  }

  /** Rauschimpuls vom Ort pos, Beginn zur AudioContext-Zeit atSec, mit derselben Hüllkurve wie das Licht. */
  scheduleBurst(opts: { pos: VisualPos; gainDb: number; atSec: number; rampMs: number; plateauMs: number }): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const durMs = 2 * opts.rampMs + opts.plateauMs;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const env = ctx.createGain();
    env.gain.value = 0;
    const peak = dbToGain(opts.gainDb);
    const curve = new Float32Array(CURVE_POINTS);
    for (let i = 0; i < CURVE_POINTS; i++) {
      curve[i] = peak * envelope((i / (CURVE_POINTS - 1)) * durMs, opts.rampMs, opts.plateauMs);
    }
    env.gain.setValueCurveAtTime(curve, opts.atSec, durMs / 1000);
    src.connect(env);
    this.connectSpatial(env, opts.pos).connect(master);
    const offset = Math.random() * Math.max(0, NOISE_SECONDS - durMs / 1000 - 0.01);
    src.start(opts.atSec, offset);
    src.stop(opts.atSec + durMs / 1000 + 0.05);
  }

  /** Weicher Glockenton als Rückmeldung bei einem Treffer (Spitze CHIME_PEAK). */
  playChime(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + 0.01;
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(CHIME_PEAK, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    env.connect(master);
    for (const f of [660, 990]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(env);
      osc.start(t);
      osc.stop(t + 0.45);
    }
  }

  /** Testton für die Einrichtung: 30° links bzw. rechts auf Augenhöhe. */
  testSide(side: Side): void {
    this.scheduleBurst({ pos: { side, eccDeg: 30, angleDeg: 0 }, gainDb: 0, atSec: this.nowSec() + 0.05, rampMs: 150, plateauMs: 300 });
  }

  private applyMaster(): void {
    if (this.master) this.master.gain.value = MASTER_GAIN_CAP * this.settings.volume;
  }

  private connectSpatial(input: AudioNode, pos: VisualPos): AudioNode {
    const ctx = this.ctx!;
    const { azimuthDeg, elevationDeg } = visualToAzEl(pos);
    const { balance } = this.settings;
    if (this.settings.outputMode === 'headphones') {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1;
      const az = azimuthDeg * RAD;
      const el = elevationDeg * RAD;
      // Web-Audio-Koordinaten: x rechts, y oben, Hörer blickt nach -z
      p.positionX.value = Math.sin(az) * Math.cos(el);
      p.positionY.value = Math.sin(el);
      p.positionZ.value = -Math.cos(az) * Math.cos(el);
      input.connect(p);
      if (balance === 0) return p;
      const bal = ctx.createStereoPanner();
      bal.pan.value = balance;
      p.connect(bal);
      return bal;
    }
    const sp = ctx.createStereoPanner();
    sp.pan.value = clamp(stereoPan(azimuthDeg) + balance, -1, 1);
    input.connect(sp);
    return sp;
  }

  /** Rosa Rauschen (Filter nach Paul Kellet), auf NOISE_RMS normiert. */
  private makePinkNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      data[i] = v;
    }
    normalizeRms(data, NOISE_RMS);
    return buf;
  }
}
