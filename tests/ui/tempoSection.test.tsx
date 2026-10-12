// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { render } from 'preact';
import { DEFAULT_TIMING } from '../../src/core/timing';
import { openDb } from '../../src/store/db';
import { TempoSection } from '../../src/ui/admin/TempoSection';

let n = 0;
const settle = () => new Promise((r) => setTimeout(r, 20));
/** Wartet, bis die Bedingung gilt (IndexedDB ist unter Last langsamer als ein fester Takt). */
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!;
const slider = (root: Element, i: number) => root.querySelectorAll<HTMLInputElement>('input[type="range"]')[i]!;
const drag = (el: HTMLInputElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Abschnitt Tempo in der Verwaltung', () => {
  it('zeigt Standard, speichert geklemmt, stellt Standard wieder her', async () => {
    const db = await openDb(`tempo-${n++}`);
    const root = document.createElement('div');
    document.body.appendChild(root);
    let changed = 0;
    render(<TempoSection db={db} onChanged={() => changed++} />, root);
    await until(() => root.textContent!.includes('Licht sichtbar'));

    expect(root.textContent).toContain('Licht sichtbar: 1,0 s');
    expect(root.textContent).toContain('Pause zwischen den Lichtern, von: 1,5 s');
    expect(root.textContent).toContain('Pause zwischen den Lichtern, bis: 3,5 s');
    expect(root.textContent).toContain('Zeit zum Tippen mindestens: 2,0 s');

    drag(slider(root, 0), '1.4'); // Plateau 1100
    drag(slider(root, 3), '3'); // Tippzeit 3000
    drag(slider(root, 1), '4.5'); // von über bis → bis rückt mit
    await settle();
    expect(root.textContent).toContain('Licht sichtbar: 1,4 s');
    expect(root.textContent).toContain('Pause zwischen den Lichtern, bis: 4,5 s');

    button(root, 'Tempo speichern').click();
    await until(() => root.textContent!.includes('Gespeichert.'));
    const s = await db.getSettings();
    expect(s.timing).toEqual({ plateauMs: 1100, waitMinMs: 4500, waitMaxMs: 4500, responseWindowMinMs: 3000 });
    expect(s.responseWindowMs).toBe(3000);
    expect(changed).toBe(1);
    expect(root.textContent).toContain('ab der nächsten Sitzung');

    button(root, 'Standard wiederherstellen').click();
    await settle();
    expect(root.textContent).toContain('Licht sichtbar: 1,0 s');
    button(root, 'Tempo speichern').click();
    await until(() => root.textContent!.includes('Gespeichert.'));
    expect((await db.getSettings()).timing).toEqual(DEFAULT_TIMING);
    expect((await db.getSettings()).responseWindowMs).toBe(2000);

    render(null, root);
    root.remove();
  }, 15_000);
});
