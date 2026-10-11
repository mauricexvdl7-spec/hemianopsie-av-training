// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { render } from 'preact';
import { DEFAULT_SETTINGS, openDb } from '../../src/store/db';
import { EXPORT_SCHEMA, exportAll, previewBundle } from '../../src/store/exportData';
import { ExportPage } from '../../src/ui/admin/ExportPage';
import { sampleRecord } from '../helpers/plans';

let n = 0;
const settle = () => new Promise((r) => setTimeout(r, 20));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!;

/** Wählt eine Datei im Dateifeld „Sicherung einspielen“. */
function pick(root: Element, json: unknown): void {
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([JSON.stringify(json)], 'sicherung.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const session = { id: 's1', startedAtIso: '2026-10-01T09:00:00.000Z', endedAtIso: null, dayKey: '2026-10-01', kind: 'training', trialCount: 1 };
const v1 = {
  schema: 'sehtraining-export/1',
  exportedAtIso: 'x',
  settings: { ...DEFAULT_SETTINGS, disclaimerAcceptedAt: '2026-10-01T09:00:00.000Z' },
  sessions: [session],
  trials: [sampleRecord({ id: 's1-0', sessionId: 's1' })],
};

async function mount() {
  const db = await openDb(`export-import-${n++}`);
  const root = document.createElement('div');
  document.body.appendChild(root);
  let imported = 0;
  render(<ExportPage db={db} onImported={() => imported++} />, root);
  return { db, root, imported: () => imported, unmount: () => (render(null, root), root.remove()) };
}

describe('Sicherung einspielen in der Verwaltung', () => {
  it('Sicherung der Version 1: Vorschau mit Zahlen, Ersetzen spielt sie ein', async () => {
    const { db, root, imported, unmount } = await mount();
    pick(root, v1);
    await until(() => root.textContent!.includes('vorhandene Daten werden ersetzt'));
    expect(root.textContent).toContain('1 Sitzungen, 1 Durchgänge');
    expect(root.textContent).not.toContain('Unbekanntes Format');

    button(root, 'Ersetzen').click();
    await until(() => root.textContent!.includes('Eingespielt'));
    expect(root.textContent).toContain('Eingespielt: 1 Sitzungen, 1 Durchgänge.');
    expect(imported()).toBe(1);
    expect((await db.listSessions()).map((s) => s.id)).toEqual(['s1']);
    expect((await db.listTrials('s1')).map((t) => t.id)).toEqual(['s1-0']);
    expect((await db.getSettings()).disclaimerAcceptedAt).toBe('2026-10-01T09:00:00.000Z');
    unmount();
  });

  it('Sicherung der Version 2 (eigener Export) wird weiterhin akzeptiert', async () => {
    const src = await openDb(`export-import-${n++}`);
    await src.addSession({ ...session, kind: 'training' } as never);
    await src.addTrial(sampleRecord({ id: 's1-0', sessionId: 's1' }));
    const bundle = await exportAll(src, '2026-10-02T00:00:00.000Z');
    expect(bundle.schema).toBe(EXPORT_SCHEMA);
    const { root, unmount } = await mount();
    pick(root, bundle);
    await until(() => root.textContent!.includes('vorhandene Daten werden ersetzt'));
    expect(root.textContent).toContain('1 Sitzungen, 1 Durchgänge');
    unmount();
  });

  it('fremdes Format wird mit Meldung abgelehnt, keine Vorschau', async () => {
    const { root, unmount } = await mount();
    pick(root, { schema: 'etwas-anderes/1', sessions: [], trials: [] });
    await until(() => root.textContent!.includes('Unbekanntes Format'));
    expect(root.textContent).toContain('Unbekanntes Format: Das ist keine Sicherung dieser App.');
    expect(root.textContent).not.toContain('vorhandene Daten werden ersetzt');
    unmount();
  });
});

describe('previewBundle', () => {
  it('Zahlen aus Version 1 und 2, null bei unbekanntem oder kaputtem Inhalt', () => {
    expect(previewBundle(v1)).toEqual({ sessions: 1, trials: 1 });
    expect(previewBundle({ ...v1, schema: EXPORT_SCHEMA, controller: null, mapSnapshots: [] })).toEqual({ sessions: 1, trials: 1 });
    expect(previewBundle({ ...v1, schema: 'x/9' })).toBeNull();
    expect(previewBundle({ ...v1, sessions: [{}] })).toBeNull();
    expect(previewBundle(null)).toBeNull();
    expect(previewBundle('text')).toBeNull();
  });
});
