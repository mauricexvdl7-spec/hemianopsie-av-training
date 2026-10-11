/**
 * Aufnahme eigener Ansagen über das Mikrofon (MediaRecorder), höchstens 15 s.
 * Das Ergebnis wird als ArrayBuffer samt MIME-Typ gespeichert (kein Blob in IndexedDB).
 */

/** Längste Aufnahme; danach stoppt der Recorder von selbst. */
export const RECORDING_MAX_MS = 15_000;
/** Bevorzugte Formate: iOS Safari nimmt mp4 auf, Chrome und Firefox webm. */
export const RECORDING_MIME_CANDIDATES: readonly string[] = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

/** Erstes unterstütztes Format, sonst null (dann wählt der Browser selbst). */
export function pickRecordingMime(isSupported: (t: string) => boolean): string | null {
  return RECORDING_MIME_CANDIDATES.find((t) => isSupported(t)) ?? null;
}

export interface ActiveRecording {
  mimeType: string;
  /** Beendet die Aufnahme (mehrfach aufrufbar, liefert stets dasselbe Ergebnis) und gibt das Mikrofon frei. */
  stop(): Promise<{ data: ArrayBuffer; mimeType: string }>;
}

function openMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

/** Mikrofon öffnen und aufnehmen; stoppt spätestens nach RECORDING_MAX_MS; beendet die Spuren des Streams beim Stopp. */
export async function startRecording(getStream: () => Promise<MediaStream> = openMicrophone): Promise<ActiveRecording> {
  const stream = await getStream();
  const releaseMic = () => stream.getTracks().forEach((t) => t.stop());
  let recorder: MediaRecorder;
  let mime: string | null;
  try {
    mime = pickRecordingMime((t) => MediaRecorder.isTypeSupported(t));
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch (e) {
    releaseMic();
    throw e;
  }
  const mimeType = recorder.mimeType || mime || '';
  const chunks: Blob[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let result: Promise<{ data: ArrayBuffer; mimeType: string }> | null = null;

  const finished = new Promise<{ data: ArrayBuffer; mimeType: string }>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      releaseMic();
      new Blob(chunks, { type: mimeType }).arrayBuffer().then((data) => resolve({ data, mimeType }), reject);
    };
    recorder.onerror = (e) => {
      releaseMic();
      reject(e);
    };
  });

  const stop = (): Promise<{ data: ArrayBuffer; mimeType: string }> => {
    if (result) return result;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    result = finished;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      releaseMic();
    }
    return result;
  };

  try {
    recorder.start();
  } catch (e) {
    releaseMic();
    throw e;
  }
  timer = setTimeout(() => void stop().catch(() => undefined), RECORDING_MAX_MS);
  return { mimeType, stop };
}
