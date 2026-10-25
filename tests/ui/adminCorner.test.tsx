// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { AdminCorner } from '../../src/ui/patient/AdminCorner';
import { StartScreen } from '../../src/ui/patient/StartScreen';

let root: HTMLDivElement;
const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }));
const gear = () => root.querySelector('[aria-label="Einstellungen für Angehörige"]')!;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  render(null, root);
  root.remove();
});

describe('Zahnrad oben rechts', () => {
  it('ist sichtbar (ein Knopf mit Zahnrad-Symbol) und öffnet beim Klick', () => {
    const onOpen = vi.fn();
    render(<AdminCorner onOpen={onOpen} />, root);
    const el = gear();
    expect(el.tagName).toBe('BUTTON');
    expect(el.querySelector('svg')).not.toBeNull();
    fire(el, 'click');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('im Startbildschirm: Klick aufs Zahnrad öffnet den PIN-Bereich und startet kein Training', () => {
    const onStart = vi.fn();
    const onAdmin = vi.fn();
    render(<StartScreen onStart={onStart} onAdmin={onAdmin} />, root);
    fire(gear(), 'pointerdown');
    fire(gear(), 'pointerup');
    fire(gear(), 'click');
    expect(onAdmin).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('Klick daneben startet weiterhin das Training', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onAdmin={() => undefined} />, root);
    fire(root.querySelector('.start-screen')!, 'click');
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
