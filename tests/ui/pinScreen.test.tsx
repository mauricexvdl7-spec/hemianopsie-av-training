// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'preact';
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, openDb, type Settings } from '../../src/store/db';
import { createPinRecord, verifyPin } from '../../src/ui/admin/pin';
import { PinScreen } from '../../src/ui/admin/PinScreen';

let n = 0;
const settle = () => new Promise((r) => setTimeout(r, 10));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!;

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mount(pin: string | null) {
  const db = await openDb(`pin-screen-${n++}`);
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    disclaimerAcceptedAt: 'x',
    geometry: DEFAULT_GEOMETRY,
    pin: pin ? await createPinRecord(pin) : null,
  };
  await db.saveSettings(settings);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onUnlocked = vi.fn();
  const onCancel = vi.fn();
  render(<PinScreen db={db} settings={settings} onUnlocked={onUnlocked} onCancel={onCancel} />, root);
  const inputs = () => [...root.querySelectorAll<HTMLInputElement>('input')];
  return { db, root, inputs, onUnlocked, onCancel, unmount: () => (render(null, root), root.remove()) };
}

describe('PinScreen mit gespeicherter PIN', () => {
  it('richtige PIN entsperrt', async () => {
    const { root, inputs, onUnlocked, unmount } = await mount('2468');
    expect(inputs()).toHaveLength(1);
    const input = inputs()[0]!;
    expect(input.type).toBe('password');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    type(input, '2468');
    await settle();
    button(root, 'Öffnen').click();
    await until(() => onUnlocked.mock.calls.length > 0);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('falsche PIN zeigt „Falsche PIN.“ und entsperrt nicht', async () => {
    const { root, inputs, onUnlocked, unmount } = await mount('2468');
    type(inputs()[0]!, '1111');
    await settle();
    button(root, 'Öffnen').click();
    await until(() => root.textContent!.includes('Falsche PIN.'));
    expect(root.textContent).toContain('Falsche PIN.');
    expect(onUnlocked).not.toHaveBeenCalled();
    unmount();
  });

  it('Abbrechen ruft onCancel', async () => {
    const { root, onCancel, unmount } = await mount('2468');
    button(root, 'Abbrechen').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe('PinScreen ohne PIN (neu anlegen)', () => {
  it('zwei gleiche gültige Eingaben speichern die PIN und entsperren', async () => {
    const { db, root, inputs, onUnlocked, unmount } = await mount(null);
    expect(inputs()).toHaveLength(2);
    const save = () => button(root, 'PIN speichern');
    type(inputs()[0]!, '1357');
    type(inputs()[1]!, '1358');
    await settle();
    expect(save().disabled).toBe(true);
    type(inputs()[1]!, '1357');
    await settle();
    expect(save().disabled).toBe(false);
    save().click();
    await until(() => onUnlocked.mock.calls.length > 0);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    const stored = (await db.getSettings()).pin;
    expect(stored).not.toBeNull();
    expect(await verifyPin('1357', stored!)).toBe(true);
    unmount();
  });
});
