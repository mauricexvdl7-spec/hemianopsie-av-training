// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'preact';
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, openDb, type Settings } from '../../src/store/db';
import { createPinRecord, verifyPin } from '../../src/ui/admin/pin';
import { PinScreen } from '../../src/ui/admin/PinScreen';
import { sampleRecord } from '../helpers/plans';

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
  const onPinCleared = vi.fn();
  render(<PinScreen db={db} settings={settings} onUnlocked={onUnlocked} onCancel={onCancel} onPinCleared={onPinCleared} />, root);
  const inputs = () => [...root.querySelectorAll<HTMLInputElement>('input')];
  return { db, root, inputs, onUnlocked, onCancel, onPinCleared, unmount: () => (render(null, root), root.remove()) };
}

afterEach(() => vi.restoreAllMocks());

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

  it('scheitert die Prüfung: Hinweis, „Öffnen“ wieder frei, nicht entsperrt', async () => {
    const { root, inputs, onUnlocked, unmount } = await mount('2468');
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('kein crypto.subtle'));
    type(inputs()[0]!, '2468');
    await settle();
    button(root, 'Öffnen').click();
    await until(() => root.textContent!.includes('Die PIN konnte nicht geprüft werden.'));
    expect(root.textContent).toContain('Die PIN konnte nicht geprüft werden.');
    await settle();
    expect(button(root, 'Öffnen').disabled).toBe(false);
    expect(onUnlocked).not.toHaveBeenCalled();
    button(root, 'Öffnen').click();
    await until(() => onUnlocked.mock.calls.length > 0);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('Abbrechen ruft onCancel', async () => {
    const { root, onCancel, unmount } = await mount('2468');
    button(root, 'Abbrechen').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe('PinScreen: PIN vergessen', () => {
  const WORD = 'ZURÜCKSETZEN';
  const confirmInput = (root: Element) => root.querySelector<HTMLInputElement>('input[aria-label="Bestätigung"]')!;

  it('öffnet die Rückfrage; „PIN löschen“ erst mit dem richtigen Wort frei', async () => {
    const { root, unmount } = await mount('2468');
    button(root, 'PIN vergessen?').click();
    await settle();
    expect(root.textContent).toContain(
      'Die PIN wird gelöscht. Alle Trainingsdaten bleiben erhalten. Danach legst du eine neue PIN fest. Zum Bestätigen ZURÜCKSETZEN eintippen.',
    );
    expect(button(root, 'PIN löschen').disabled).toBe(true);
    type(confirmInput(root), 'zurücksetzen!');
    await settle();
    expect(button(root, 'PIN löschen').disabled).toBe(true);
    type(confirmInput(root), '  zurücksetzen ');
    await settle();
    expect(button(root, 'PIN löschen').disabled).toBe(false);
    unmount();
  });

  it('richtiges Wort: PIN gelöscht, Daten unberührt, neue PIN festlegen', async () => {
    const { db, root, inputs, onUnlocked, onPinCleared, unmount } = await mount('2468');
    const session = { id: 's1', startedAtIso: 'a', endedAtIso: 'b', dayKey: '2026-10-12', kind: 'training' as const, trialCount: 1 };
    const trial = sampleRecord({ id: 't1', sessionId: 's1' });
    await db.addSession(session);
    await db.addTrial(trial);
    const before = await db.getSettings();
    const sessionsBefore = await db.listSessions();
    button(root, 'PIN vergessen?').click();
    await settle();
    type(confirmInput(root), WORD);
    await settle();
    button(root, 'PIN löschen').click();
    await until(() => button(root, 'PIN speichern') !== undefined);
    expect(button(root, 'PIN speichern')).toBeDefined();
    expect(inputs()).toHaveLength(2);
    const after = await db.getSettings();
    expect(after.pin).toBeNull();
    expect({ ...after, pin: before.pin }).toEqual(before);
    expect(sessionsBefore).toHaveLength(1);
    expect(await db.listSessions()).toEqual(sessionsBefore);
    expect(await db.listTrials()).toEqual([trial]);
    expect(onUnlocked).not.toHaveBeenCalled();
    expect(onPinCleared).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('„Abbrechen“ in der Rückfrage führt zurück zur PIN-Eingabe', async () => {
    const { db, root, inputs, onCancel, unmount } = await mount('2468');
    button(root, 'PIN vergessen?').click();
    await settle();
    button(root, 'Abbrechen').click();
    await settle();
    expect(onCancel).not.toHaveBeenCalled();
    expect(button(root, 'Öffnen')).toBeDefined();
    expect(inputs()).toHaveLength(1);
    expect((await db.getSettings()).pin).not.toBeNull();
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
