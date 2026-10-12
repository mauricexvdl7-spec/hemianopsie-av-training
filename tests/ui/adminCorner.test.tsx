// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { ADMIN_HOLD_MS, AdminCorner } from '../../src/ui/patient/AdminCorner';
import { StartScreen } from '../../src/ui/patient/StartScreen';

let root: HTMLDivElement;
const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }));
const corner = () => root.querySelector('[aria-label="Bereich für Angehörige"]')!;

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  render(null, root);
  root.remove();
  vi.useRealTimers();
});

describe('AdminCorner', () => {
  it('löst nach 3000 ms Halten genau einmal aus', () => {
    expect(ADMIN_HOLD_MS).toBe(3000);
    const onLongPress = vi.fn();
    render(<AdminCorner onLongPress={onLongPress} />, root);
    fire(corner(), 'pointerdown');
    vi.advanceTimersByTime(2999);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('Loslassen, Abbruch oder Verlassen vor Ablauf bricht ab', () => {
    const onLongPress = vi.fn();
    render(<AdminCorner onLongPress={onLongPress} />, root);
    for (const end of ['pointerup', 'pointercancel', 'pointerleave']) {
      fire(corner(), 'pointerdown');
      vi.advanceTimersByTime(1000);
      fire(corner(), end);
      vi.advanceTimersByTime(5000);
    }
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('eigene Haltedauer', () => {
    const onLongPress = vi.fn();
    render(<AdminCorner onLongPress={onLongPress} holdMs={500} />, root);
    fire(corner(), 'pointerdown');
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

describe('AdminCorner im Startbildschirm', () => {
  it('Klick auf die Ecke startet kein Training', () => {
    const onStart = vi.fn();
    const onAdmin = vi.fn();
    render(<StartScreen onStart={onStart} onAdmin={onAdmin} />, root);
    fire(corner(), 'pointerdown');
    fire(corner(), 'pointerup');
    fire(corner(), 'click');
    vi.advanceTimersByTime(5000);
    expect(onStart).not.toHaveBeenCalled();
    expect(onAdmin).not.toHaveBeenCalled();
  });

  it('langes Drücken öffnet den PIN-Bereich, startet aber kein Training', () => {
    const onStart = vi.fn();
    const onAdmin = vi.fn();
    render(<StartScreen onStart={onStart} onAdmin={onAdmin} />, root);
    fire(corner(), 'pointerdown');
    vi.advanceTimersByTime(3000);
    fire(corner(), 'pointerup');
    fire(corner(), 'click');
    expect(onAdmin).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('Tippen außerhalb der Ecke startet weiterhin', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onAdmin={vi.fn()} />, root);
    fire(root.querySelector('.start-screen')!, 'click');
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
