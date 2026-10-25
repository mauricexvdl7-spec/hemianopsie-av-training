/**
 * Ansagen: eigene Aufnahme der Angehörigen oder Systemstimme (speechSynthesis).
 * Jede Ansage erfüllt sich immer (Ende, Fehler oder Zeitgrenze), `say` lehnt nie ab,
 * denn der Ablauf wartet auf die Ansage, bevor der erste Durchgang beginnt.
 */
import { RECORDING_MAX_MS } from './recorder';

export type AnnouncementKey = 'greeting' | 'instruction' | 'pauseStart' | 'pauseReady' | 'end' | 'dailyLimit' | 'encouragement';

export const ANNOUNCEMENT_KEYS: readonly AnnouncementKey[] = ['greeting', 'instruction', 'pauseStart', 'pauseReady', 'end', 'dailyLimit', 'encouragement'];

export const DEFAULT_ANNOUNCEMENTS: Record<AnnouncementKey, string> = {
  greeting: 'Hallo! Schön, dass du da bist.',
  instruction: 'Schau auf das Kreuz. Tippe, sobald du ein Licht siehst.',
  pauseStart: 'Kurze Pause.',
  pauseReady: 'Wenn du weitermachen willst, tippe auf den Bildschirm.',
  end: 'Gut gemacht. Die Übung ist zu Ende.',
  dailyLimit: 'Für heute ist genug, morgen geht es weiter.',
  encouragement: 'Schön, dass du dabei warst.',
};

export const SPEECH_RATE = 0.9;
/** Zusätzliche Zeit über die Höchstdauer einer Aufnahme hinaus, bevor die Ansage als beendet gilt. */
const CLIP_GRACE_MS = 2000;

/** Zeitgrenze einer gesprochenen Ansage (iOS feuert `end` nicht immer). */
/** Beginnt die Stimme so lange nicht zu sprechen (kein `start`), gilt sie als hängend (z. B. Chrome-Warteschlange, keine Stimme). */
export const SPEECH_START_TIMEOUT_MS = 2500;

export function speechTimeoutMs(text: string): number {
  return 3000 + 120 * text.length;
}

/** Getrimmter eigener Text, sonst Standard. */
export function textFor(key: AnnouncementKey, overrides: Partial<Record<AnnouncementKey, string>>): string {
  const own = overrides[key]?.trim();
  return own ? own : DEFAULT_ANNOUNCEMENTS[key];
}

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
}

/** Deutsche Stimme in der Reihenfolge: lokal de-DE, lokal de-*, irgendeine de-*, sonst keine. */
export function pickGermanVoice<V extends VoiceLike>(voices: readonly V[]): { voice: V; local: boolean } | null {
  const de = voices.filter((v) => v.lang.toLowerCase().startsWith('de'));
  // Reihenfolge: natürliche Online-Stimmen (Edge „Natural“) klingen am besten, dann „Google Deutsch“ (Chrome),
  // danach lokale Stimmen (iPad offline, Windows „Hedda“/„Katja“) – lokal de-DE vor anderen deutschen.
  const found =
    de.find((v) => /natural|neural/i.test(v.name)) ??
    de.find((v) => /google/i.test(v.name)) ??
    de.find((v) => v.localService && v.lang === 'de-DE') ??
    de.find((v) => v.localService) ??
    de[0];
  return found ? { voice: found, local: found.localService } : null;
}

export interface SpeechLike {
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
  addEventListener?(type: 'voiceschanged', cb: () => void): void;
  removeEventListener?(type: 'voiceschanged', cb: () => void): void;
}

export interface VoiceDeps {
  synth: SpeechLike | null;
  makeUtterance(text: string): SpeechSynthesisUtterance;
  playClip(data: ArrayBuffer): Promise<void>;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export class Voice {
  private texts: Partial<Record<AnnouncementKey, string>> = {};
  private recordings: ReadonlyMap<AnnouncementKey, ArrayBuffer> = new Map();

  constructor(private readonly deps: VoiceDeps) {}

  setTexts(overrides: Partial<Record<AnnouncementKey, string>>): void {
    this.texts = overrides;
  }

  setRecordings(recs: ReadonlyMap<AnnouncementKey, ArrayBuffer>): void {
    this.recordings = recs;
  }

  /** Synchron im Tipp-Handler aufrufen: leere Äußerung, damit iOS spätere Ansagen erlaubt. */
  unlock(): void {
    const { synth } = this.deps;
    if (!synth) return;
    try {
      synth.speak(this.deps.makeUtterance(''));
    } catch {
      // ohne Sprachausgabe nichts zu entsperren
    }
  }

  /** Aufnahme, sonst Systemstimme; erfüllt sich immer (Ende, Fehler oder Zeitgrenze), nie reject. */
  say(key: AnnouncementKey): Promise<void> {
    const text = textFor(key, this.texts);
    const rec = this.recordings.get(key);
    return rec ? this.playRecording(rec, text) : this.speak(text);
  }

  /** Nur Systemstimme (Sätze mit Zahlen). */
  speakText(text: string): Promise<void> {
    return this.speak(text);
  }

  cancel(): void {
    try {
      this.deps.synth?.cancel();
    } catch {
      // nichts zu tun
    }
  }

  /** Irgendeine deutsche Stimme vorhanden (lokal oder online). */
  hasGermanVoice(): boolean {
    return this.german() !== null;
  }

  /** Name der Stimme, die gerade spricht; null ohne deutsche Stimme. */
  germanVoiceName(): string | null {
    return this.german()?.voice.name ?? null;
  }

  hasLocalGermanVoice(): boolean {
    return this.german()?.local ?? false;
  }

  /** Meldet geänderte Stimmenliste; liefert Abmeldefunktion. */
  onVoicesChanged(cb: () => void): () => void {
    const { synth } = this.deps;
    synth?.addEventListener?.('voiceschanged', cb);
    return () => synth?.removeEventListener?.('voiceschanged', cb);
  }

  private german(): { voice: SpeechSynthesisVoice; local: boolean } | null {
    try {
      return this.deps.synth ? pickGermanVoice(this.deps.synth.getVoices()) : null;
    } catch {
      return null;
    }
  }

  /** Aufnahme abspielen; scheitert das, spricht die Systemstimme. Zeitgrenze: Aufnahmehöchstdauer + Puffer. */
  private playRecording(data: ArrayBuffer, fallbackText: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;
      const timer = this.deps.setTimeout(() => finish(), RECORDING_MAX_MS + CLIP_GRACE_MS);
      const finish = () => {
        if (settled) return;
        settled = true;
        this.deps.clearTimeout(timer);
        resolve();
      };
      this.deps.playClip(data).then(finish, () => {
        if (settled) return;
        settled = true;
        this.deps.clearTimeout(timer);
        void this.speak(fallbackText).then(resolve);
      });
    });
  }

  private speak(text: string): Promise<void> {
    const { synth } = this.deps;
    if (!synth) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      let timer: unknown;
      let startTimer: unknown;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) this.deps.clearTimeout(timer);
        if (startTimer !== undefined) this.deps.clearTimeout(startTimer);
        resolve();
      };
      try {
        const u = this.deps.makeUtterance(text);
        u.lang = 'de-DE';
        u.rate = SPEECH_RATE;
        const pick = this.german();
        if (pick) u.voice = pick.voice;
        u.onstart = () => {
          if (startTimer !== undefined) this.deps.clearTimeout(startTimer);
          startTimer = undefined;
        };
        u.onend = finish;
        u.onerror = finish;
        timer = this.deps.setTimeout(finish, speechTimeoutMs(text));
        // Hängende Sprachausgabe nicht lange abwarten: Warteschlange leeren und weiter (er sitzt sonst vor einem leeren Bildschirm)
        startTimer = this.deps.setTimeout(() => {
          startTimer = undefined;
          if (settled) return;
          try {
            synth.cancel();
          } catch {
            // nichts zu tun
          }
          finish();
        }, SPEECH_START_TIMEOUT_MS);
        synth.speak(u);
      } catch {
        finish();
      }
    });
  }
}

/** Voice mit den Browser-Schnittstellen; wo sie fehlen (ältere Browser, Tests), bleibt es still und erfüllt sich sofort. */
export function createBrowserVoice(audio: { playClip(data: ArrayBuffer): Promise<void> }): Voice {
  const synth = typeof SpeechSynthesisUtterance === 'undefined' ? null : (globalThis.speechSynthesis ?? null);
  return new Voice({
    synth,
    makeUtterance: (text) => new SpeechSynthesisUtterance(text),
    playClip: (data) => audio.playClip(data),
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
  });
}
