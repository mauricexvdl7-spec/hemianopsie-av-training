// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render } from 'preact';
import { createControllerState } from '../../src/core/controller';
import { makeGeometry } from '../../src/core/geometry';
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, openDb } from '../../src/store/db';
import { SettingsPage } from '../../src/ui/admin/SettingsPage';

let n = 0;
const settle = () => new Promise((r) => setTimeout(r, 20));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!;
/** Preact zeichnet nach einer Eingabe erst im nächsten Takt neu; erst dann sieht der Knopf den neuen Wert. */
const choose = async (el: HTMLSelectElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
};
const SAVED = 'Gespeichert. Gilt ab der nächsten Sitzung.';

async function mount(withGeometry = true) {
  const db = await openDb(`settings-page-${n++}`);
  await db.saveSettings({ ...DEFAULT_SETTINGS, geometry: withGeometry ? DEFAULT_GEOMETRY : null, setupViewport: withGeometry ? { width: 1200, height: 800 } : null });
  if (withGeometry) await db.saveController(createControllerState(makeGeometry(DEFAULT_GEOMETRY, 1200, 800)));
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onChanged = vi.fn();
  render(<SettingsPage db={db} onChanged={onChanged} />, root);
  await until(() => root.textContent!.includes(withGeometry ? 'Halbwertszeit speichern' : 'Erst die Einrichtung abschließen'));
  return { db, root, onChanged };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('SettingsPage', () => {
  it('speichert die Sitzungsdauer und meldet die Änderung', async () => {
    const { db, root, onChanged } = await mount();
    await choose(root.querySelector<HTMLSelectElement>('select[aria-label="Sitzungsdauer"]')!, '20');
    button(root, 'Sitzungsdauer speichern').click();
    await until(() => root.textContent!.includes(SAVED));
    expect((await db.getSettings()).sessionMinutes).toBe(20);
    expect(onChanged).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('speichert das Raster und zeigt den Hinweis zur neuen Karte', async () => {
    const { db, root } = await mount();
    expect(root.textContent).toContain('Eine Änderung legt eine neue Karte an. Die alte bleibt gespeichert und ist in der Auswertung sichtbar.');
    await choose(root.querySelector<HTMLSelectElement>('select[aria-label="Winkel"]')!, '30');
    button(root, 'Raster speichern').click();
    await until(() => root.textContent!.includes(SAVED));
    expect((await db.getSettings()).grid).toEqual({ eccStartDeg: 3, eccStepDeg: 5, angleStepDeg: 30 });
  }, 15_000);

  it('setzt die Phase nur nach Bestätigung', async () => {
    const { db, root } = await mount();
    const pick = () => choose(root.querySelector<HTMLSelectElement>('select[aria-label="Phase"]')!, '2');

    const no = vi.fn(() => false);
    vi.stubGlobal('confirm', no);
    await pick();
    button(root, 'Phase setzen').click();
    await settle();
    expect(no).toHaveBeenCalledTimes(1);
    expect((await db.getController())!.phase.stage).toBe('1');

    const yes = vi.fn(() => true);
    vi.stubGlobal('confirm', yes);
    button(root, 'Phase setzen').click();
    await until(() => root.textContent!.includes(SAVED));
    const c = (await db.getController())!;
    expect(c.phase.stage).toBe('2');
    expect(c.phase.log.at(-1)).toMatchObject({ from: '1', to: '2', reason: 'manual' });
    await until(() => root.textContent!.includes('von Hand'));
    expect(root.textContent).toContain('von Hand');
  }, 15_000);

  it('speichert die Halbwertszeit im Controller', async () => {
    const { db, root } = await mount();
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Halbwertszeit in Sitzungen"]')!;
    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    button(root, 'Halbwertszeit speichern').click();
    await until(() => root.textContent!.includes(SAVED));
    expect((await db.getController())!.halfLifeSessions).toBe(12);
  }, 15_000);

  it('ohne Geometrie: Hinweis statt Phase und Vergessen', async () => {
    const { root } = await mount(false);
    expect(root.querySelector('select[aria-label="Phase"]')).toBeNull();
    expect(root.querySelector('input[aria-label="Halbwertszeit in Sitzungen"]')).toBeNull();
    expect(root.textContent).toContain('Erst die Einrichtung abschließen');
  }, 15_000);
});
