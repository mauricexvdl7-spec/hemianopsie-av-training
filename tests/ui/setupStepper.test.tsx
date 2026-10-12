// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from 'preact';
import { SETUP_STEPS, Stepper } from '../../src/ui/setup/SetupWizard';
import { PinStep } from '../../src/ui/setup/steps/PinStep';
import { createPinRecord, verifyPin } from '../../src/ui/admin/pin';

const settle = () => new Promise((r) => setTimeout(r, 10));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function mountRoot() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return { root, unmount: () => (render(null, root), root.remove()) };
}

describe('Stepper', () => {
  it('zeigt „Schritt 2 von 4“ und markiert erledigte, aktuelle und offene Punkte', () => {
    const { root, unmount } = mountRoot();
    render(<Stepper index={1} count={4} />, root);
    expect(root.textContent).toBe('Schritt 2 von 4');
    const dots = [...root.querySelectorAll('.stepper-dots span')].map((d) => d.className);
    expect(dots).toEqual(['done', 'current', '', '']);
    unmount();
  });

  it('Einrichtung hat 5 Schritte, die PIN ist der letzte', () => {
    expect(SETUP_STEPS).toEqual(['disclaimer', 'geometry', 'audio', 'reference', 'pin']);
    const { root, unmount } = mountRoot();
    render(<Stepper index={SETUP_STEPS.indexOf('pin')} count={SETUP_STEPS.length} />, root);
    expect(root.textContent).toBe('Schritt 5 von 5');
    unmount();
  });
});

describe('PinStep', () => {
  it('„PIN speichern“ nur bei gültiger und gleicher PIN, ohne vorhandene PIN kein „PIN behalten“', async () => {
    const { root, unmount } = mountRoot();
    const onNext = vi.fn();
    render(<PinStep existing={null} onNext={onNext} />, root);
    const inputs = [...root.querySelectorAll<HTMLInputElement>('input')];
    expect(inputs).toHaveLength(2);
    for (const i of inputs) {
      expect(i.type).toBe('password');
      expect(i.getAttribute('inputmode')).toBe('numeric');
      expect(i.maxLength).toBe(4);
    }
    expect(button(root, 'PIN behalten')).toBeUndefined();
    const save = () => button(root, 'PIN speichern')!;
    expect(save().disabled).toBe(true);
    type(inputs[0]!, '12a4');
    type(inputs[1]!, '12a4');
    await settle();
    expect(save().disabled).toBe(true);
    type(inputs[0]!, '4321');
    type(inputs[1]!, '4320');
    await settle();
    expect(save().disabled).toBe(true);
    type(inputs[1]!, '4321');
    await settle();
    expect(save().disabled).toBe(false);
    save().click();
    await until(() => onNext.mock.calls.length > 0);
    expect(await verifyPin('4321', onNext.mock.calls[0]![0])).toBe(true);
    unmount();
  });

  it('bei vorhandener PIN zusätzlich „PIN behalten“', async () => {
    const { root, unmount } = mountRoot();
    const existing = await createPinRecord('1234');
    const onNext = vi.fn();
    render(<PinStep existing={existing} onNext={onNext} />, root);
    button(root, 'PIN behalten')!.click();
    await until(() => onNext.mock.calls.length > 0);
    expect(onNext).toHaveBeenCalledWith(existing);
    unmount();
  });
});
