// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, type Db, type Settings } from '../../src/store/db';
import { AudioEngine } from '../../src/io/audio';

const started = vi.hoisted(() => ({ geometries: [] as Array<{ viewportWidthPx: number; viewportHeightPx: number }> }));

vi.mock('../../src/ui/session', async (orig) => ({
  ...(await orig<typeof import('../../src/ui/session')>()),
  startTrainingSession: vi.fn(async (args: { geometry: { viewportWidthPx: number; viewportHeightPx: number } }) => {
    started.geometries.push(args.geometry);
    return { run: async () => ({ records: [], aborted: true }), finish: async () => undefined, records: [] };
  }),
}));

import { TrainingScreen } from '../../src/ui/patient/TrainingScreen';

function setWindow(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

const settings: Settings = { ...DEFAULT_SETTINGS, geometry: DEFAULT_GEOMETRY, setupViewport: { width: 1180, height: 820 } };

async function mount(): Promise<{ root: HTMLElement; unmount(): void }> {
  const root = document.createElement('div');
  document.body.appendChild(root);
  await act(async () => {
    render(<TrainingScreen db={{} as Db} audio={new AudioEngine()} settings={settings} onExit={() => undefined} />, root);
  });
  return {
    root,
    unmount: () => {
      render(null, root);
      root.remove();
    },
  };
}

afterEach(() => {
  started.geometries.length = 0;
});

describe('TrainingScreen', () => {
  it('plant mit der Fenstergröße der Einrichtung, nicht mit dem Live-Fenster (innerhalb der Toleranz)', async () => {
    setWindow(1164, 804);
    const m = await mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(started.geometries).toHaveLength(1);
    expect(started.geometries[0]!.viewportWidthPx).toBe(1180);
    expect(started.geometries[0]!.viewportHeightPx).toBe(820);
    m.unmount();
  });

  it('Pause-Ansicht: Text folgt Drehen und Fenstergröße (Hochformat → quer → falsche Größe → Hochformat)', async () => {
    setWindow(820, 1180);
    const m = await mount();
    expect(m.root.textContent).toContain('Bitte das iPad quer halten.');

    await act(async () => {
      setWindow(1180, 820);
      window.dispatchEvent(new Event('resize'));
    });
    expect(m.root.textContent).toContain('Pause. Tippe zum Weitermachen.');

    await act(async () => {
      setWindow(900, 700);
      window.dispatchEvent(new Event('orientationchange'));
    });
    expect(m.root.textContent).toContain('Bitte die App im Vollbild verwenden.');

    await act(async () => {
      setWindow(700, 900);
      window.dispatchEvent(new Event('resize'));
    });
    expect(m.root.textContent).toContain('Bitte das iPad quer halten.');
    m.unmount();
  });
});
