// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'preact';
import { DEFAULT_SETTINGS, openDb } from '../../src/store/db';
import type { Voice } from '../../src/io/voice';
import { AdminHome } from '../../src/ui/admin/AdminHome';
import { DISCLAIMER_TEXT } from '../../src/ui/setup/steps/Disclaimer';

let n = 0;
const settle = () => new Promise((r) => setTimeout(r, 10));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const REMINDER = 'Bitte die Daten sichern: Wird die App gelöscht, sind alle Daten weg.';
const NO_VOICE = 'Auf diesem Gerät fehlt eine deutsche Stimme.';

function fakeVoice(local: boolean) {
  let cb: (() => void) | null = null;
  const v = {
    local,
    hasLocalGermanVoice: () => v.local,
    onVoicesChanged: (f: () => void) => {
      cb = f;
      return () => (cb = null);
    },
    fire: () => cb?.(),
    subscribed: () => cb !== null,
  };
  return v;
}

async function mount(opts: { trained: boolean; lastExportAtIso: string | null; local: boolean }) {
  const db = await openDb(`admin-home-${n++}`);
  await db.saveSettings({ ...DEFAULT_SETTINGS, lastExportAtIso: opts.lastExportAtIso });
  if (opts.trained) {
    await db.addSession({ id: 's1', startedAtIso: '2026-10-01T09:00:00.000Z', endedAtIso: null, dayKey: '2026-10-01', kind: 'training', trialCount: 3 });
  }
  const voice = fakeVoice(opts.local);
  const onLeave = vi.fn();
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(<AdminHome db={db} voice={voice as unknown as Voice} onLeave={onLeave} />, root);
  return { root, voice, onLeave, unmount: () => (render(null, root), root.remove()) };
}

describe('AdminHome', () => {
  it('zeigt alle Wege, den Hinweis als Fußzeile und verlässt den Bereich', async () => {
    const { root, onLeave, unmount } = await mount({ trained: false, lastExportAtIso: null, local: true });
    const links = [...root.querySelectorAll('a')].map((a) => [a.querySelector('h2')!.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Auswertung', '#/admin/eval'],
      ['Monatsbericht', '#/admin/report'],
      ['Einstellungen', '#/admin/settings'],
      ['Ansagen', '#/admin/voice'],
      ['Export und Sicherung', '#/admin/export'],
      ['Testseite', '#/admin/test'],
      ['Kamera testen', '#/admin/camera'],
      ['Einrichtung wiederholen', '#/setup'],
    ]);
    const settingsLink = root.querySelector('a[href="#/admin/settings"]')!;
    expect(settingsLink.textContent).toContain('Sitzungsdauer, Tempo, Raster, Phase, Vergessen');
    expect(root.textContent).toContain(DISCLAIMER_TEXT);
    await settle();
    await settle();
    expect(root.textContent).not.toContain(REMINDER);
    expect(root.textContent).not.toContain(NO_VOICE);
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Zurück zum Training')!.click();
    expect(onLeave).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('Erinnerung an die Sicherung nach Training ohne Export', async () => {
    const { root, unmount } = await mount({ trained: true, lastExportAtIso: null, local: true });
    await until(() => root.textContent!.includes(REMINDER));
    expect(root.textContent).toContain(REMINDER);
    unmount();
  });

  it('keine Erinnerung nach frischem Export', async () => {
    const { root, voice, unmount } = await mount({ trained: true, lastExportAtIso: new Date().toISOString(), local: true });
    await until(voice.subscribed);
    await settle();
    await settle();
    expect(root.textContent).not.toContain(REMINDER);
    unmount();
  });

  it('Warnung ohne lokale deutsche Stimme, verschwindet wenn die Stimme nachgeladen wird', async () => {
    const { root, voice, unmount } = await mount({ trained: false, lastExportAtIso: null, local: false });
    await settle();
    expect(root.textContent).toContain(
      'Auf diesem Gerät fehlt eine deutsche Stimme. Bitte in den iPad-Einstellungen unter Bedienungshilfen → Gesprochene Inhalte → Stimmen eine deutsche Stimme laden oder eigene Aufnahmen machen.',
    );
    await until(voice.subscribed); // Effekte laufen in Preact erst nach dem Zeichnen
    voice.local = true;
    voice.fire();
    await until(() => !root.textContent!.includes(NO_VOICE));
    expect(root.textContent).not.toContain(NO_VOICE);
    unmount();
  });
});
