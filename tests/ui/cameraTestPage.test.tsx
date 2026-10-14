// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render } from 'preact';
import type { AudioEngine } from '../../src/io/audio';
import type { CameraFrame, CameraSource } from '../../src/io/camera';
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, openDb } from '../../src/store/db';
import { CameraTestPage, residualBand } from '../../src/ui/admin/CameraTestPage';

let n = 0;
const settle = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const button = (el: Element, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text);

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeCamera() {
  const subs = new Set<(f: CameraFrame) => void>();
  const video = document.createElement('video');
  const cam = {
    subscribe(cb: (f: CameraFrame) => void) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    video: () => video,
    fps: () => 24,
    stop: vi.fn(),
  } satisfies CameraSource;
  const emit = (f: CameraFrame) => subs.forEach((cb) => cb(f));
  return { cam, video, emit };
}

async function mount() {
  const db = await openDb(`camera-test-${n++}`);
  await db.saveSettings({ ...DEFAULT_SETTINGS, disclaimerAcceptedAt: 'x', geometry: DEFAULT_GEOMETRY });
  const camera = fakeCamera();
  const start = vi.fn(async (): Promise<CameraSource | null> => camera.cam);
  const onChanged = vi.fn();
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(<CameraTestPage db={db} audio={{ ensureRunning: () => Promise.resolve() } as unknown as AudioEngine} onChanged={onChanged} start={start} />, root);
  await until(() => !!root.querySelector('input[type="radio"]:checked'));
  return { db, root, camera, start, onChanged, unmount: () => (render(null, root), root.remove()) };
}

describe('residualBand', () => {
  it('grün bis 3°, gelb bis 5°, rot darüber und bei nicht auswertbar', () => {
    expect(residualBand(2.9)).toEqual({ level: 'good', label: 'gut' });
    expect(residualBand(3)).toEqual({ level: 'good', label: 'gut' });
    expect(residualBand(4.5)).toEqual({ level: 'ok', label: 'brauchbar' });
    expect(residualBand(5.1)).toEqual({ level: 'bad', label: 'zu ungenau' });
    expect(residualBand(Infinity)).toEqual({ level: 'bad', label: 'zu ungenau' });
  });
});

describe('CameraTestPage', () => {
  it('speichert die Kamera-Lage', async () => {
    const m = await mount();
    const top = [...m.root.querySelectorAll<HTMLInputElement>('input[type="radio"]')][1]!;
    top.click();
    await until(() => m.onChanged.mock.calls.length > 0);
    expect((await m.db.getSettings()).camera.placement).toBe('top');
    m.unmount();
  });

  it('zeigt nach dem Start Vorschau, Bilder pro Sekunde, Gesicht und Hinweis', async () => {
    const m = await mount();
    button(m.root, 'Kamera starten')!.click();
    await until(() => m.root.textContent!.includes('Bilder pro Sekunde'));
    expect(m.camera.video.parentElement?.classList.contains('camera-preview-box')).toBe(true);
    await settle(150);
    expect(m.root.textContent).toContain('Bilder pro Sekunde: 24');
    expect(m.root.textContent).toContain('Gesicht erkannt: nein');
    expect(m.root.textContent).toContain('Kein Gesicht im Bild');

    m.camera.emit({ tMs: 1, features: null, facePx: { x: 0.5, y: 0.5 } });
    await settle(150);
    expect(m.root.textContent).toContain('Gesicht erkannt: ja');
    expect(m.root.textContent).toContain('Lage passt.');
    m.unmount();
  });

  it('„Zurück“ und Verlassen der Seite stoppen die Kamera', async () => {
    const m = await mount();
    button(m.root, 'Kamera starten')!.click();
    await until(() => !!button(m.root, 'Kamera stoppen'));
    button(m.root, 'Zurück')!.click();
    expect(m.camera.cam.stop).toHaveBeenCalled();
    expect(location.hash).toBe('#/admin');
    m.unmount();

    const m2 = await mount();
    button(m2.root, 'Kamera starten')!.click();
    await until(() => !!button(m2.root, 'Kamera stoppen'));
    m2.unmount();
    expect(m2.camera.cam.stop).toHaveBeenCalled();
  });

  it('ohne Kamera: deutsche Meldung, Kalibrieren gesperrt', async () => {
    const m = await mount();
    m.start.mockResolvedValueOnce(null);
    button(m.root, 'Kamera starten')!.click();
    await until(() => m.root.textContent!.includes('nicht verfügbar'));
    expect(button(m.root, 'Kalibrieren')!.disabled).toBe(true);
    m.unmount();
  });
});
