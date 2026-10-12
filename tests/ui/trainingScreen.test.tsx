// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { DEFAULT_GEOMETRY, DEFAULT_SETTINGS, type Db, type SessionRecord, type Settings } from '../../src/store/db';
import type { AudioEngine } from '../../src/io/audio';
import type { AnnouncementKey, Voice } from '../../src/io/voice';
import type { TrialRecord } from '../../src/core/types';
import type { RunnerDeps } from '../../src/ui/runner';
import { sampleRecord } from '../helpers/plans';

/** Gemeinsames Protokoll: Ansagen (`say:…`, `text:…`) und Läufe (`run`) in ihrer Reihenfolge. */
const fake = vi.hoisted(() => ({
  log: [] as string[],
  activeMs: 0,
  /** Je Lauf: nach so viel aktiver Zeit dieses Laufs (ms) abbrechen; leer/undefined → kein Abbruch. */
  aborts: [] as Array<number | undefined>,
  finish: null as null | (() => Promise<void>),
  startArgs: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../src/ui/TrialStage', async () => {
  const { useEffect } = await import('preact/hooks');
  return {
    // Ersatz für die Bühne: ruft run() beim Mount auf, ohne Canvas
    TrialStage: (props: { run(deps: RunnerDeps): Promise<void> }) => {
      useEffect(() => {
        void props.run({} as RunnerDeps);
      }, []);
      return null;
    },
  };
});

vi.mock('../../src/ui/session', async (orig) => ({
  ...(await orig<typeof import('../../src/ui/session')>()),
  startTrainingSession: vi.fn(async (args: Record<string, unknown>) => {
    fake.startArgs.push(args);
    return {
      records: [],
      activeMs: () => fake.activeMs,
      // Wie die echte Sitzung: vor jedem „Durchgang“ (hier 1 Minute aktive Zeit) stopWhen fragen
      run: async (_deps: unknown, opts?: { stopWhen?(): boolean }) => {
        fake.log.push('run');
        const abortAfter = fake.aborts.shift();
        let ran = 0;
        for (let i = 0; i < 100 && !opts?.stopWhen?.(); i++) {
          fake.activeMs += 60_000;
          ran += 60_000;
          if (abortAfter !== undefined && ran >= abortAfter) return { records: [], aborted: true };
        }
        return { records: [], aborted: false };
      },
      finish: fake.finish,
    };
  }),
}));

import { TrainingScreen } from '../../src/ui/patient/TrainingScreen';

function setWindow(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

/** Fake-Stimme: protokolliert und erfüllt sofort; einzelne Ansagen können per `hang` verzögert werden. */
function fakeVoice(hang: Partial<Record<AnnouncementKey, number>> = {}) {
  const cancel = vi.fn();
  const voice = {
    say: (key: AnnouncementKey) => {
      fake.log.push(`say:${key}`);
      const ms = hang[key];
      return ms === undefined ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, ms));
    },
    speakText: (text: string) => {
      fake.log.push(`text:${text}`);
      return Promise.resolve();
    },
    cancel,
    unlock: vi.fn(),
  };
  return { voice: voice as unknown as Voice, cancel };
}

/** `listTrials` filtert wie die echte Datenbank nach Sitzung (Index) und protokolliert die Aufrufe. */
function fakeDb(sessions: SessionRecord[] = [], trials: TrialRecord[] = []) {
  const listTrials = vi.fn(async (sessionId?: string) =>
    sessionId === undefined ? trials : trials.filter((t) => t.sessionId === sessionId),
  );
  return Object.assign({ listSessions: async () => sessions, listTrials } as unknown as Db, { listTrials });
}

const TODAY = '2026-10-12';
const YESTERDAY = '2026-10-11';

function session(id: string, day: string, trialCount = 1): SessionRecord {
  return {
    id,
    startedAtIso: `${day}T08:00:00.000Z`,
    endedAtIso: `${day}T08:30:00.000Z`,
    dayKey: day,
    kind: 'training',
    trialCount,
  };
}

/** `found` Treffer und `total - found` Verpasser links in Sitzung `sessionId`. */
function leftTrials(sessionId: string, found: number, total: number): TrialRecord[] {
  return Array.from({ length: total }, (_, i) =>
    sampleRecord({ id: `${sessionId}-${i}`, sessionId, outcome: i < found ? 'hit' : 'miss' }),
  );
}

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  geometry: DEFAULT_GEOMETRY,
  setupViewport: { width: 1180, height: 820 },
};

const audio = { ensureRunning: async () => undefined, playChime: vi.fn() } as unknown as AudioEngine;

let root: HTMLElement;

async function mount(opts: { db?: Db; voice?: Voice; settings?: Settings; onExit?: () => void } = {}) {
  root = document.createElement('div');
  document.body.appendChild(root);
  const voice = opts.voice ?? fakeVoice().voice;
  await act(async () => {
    render(
      <TrainingScreen
        db={opts.db ?? fakeDb()}
        audio={audio}
        voice={voice}
        settings={opts.settings ?? baseSettings}
        onExit={opts.onExit ?? (() => undefined)}
        now={() => Date.now()}
      />,
      root,
    );
  });
  await flush();
}

/** Uhr (Fake-Timer, auch `Date.now`) vorstellen und alle Folgeschritte samt Effekten abarbeiten. */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function tap(el: Element | null = root.firstElementChild): Promise<void> {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

const runs = () => fake.log.filter((e) => e === 'run').length;
const says = () => fake.log.filter((e) => e !== 'run');
const finishButton = () => [...root.querySelectorAll('button')].find((b) => b.textContent === 'Fertig für heute') ?? null;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 12, 10, 0, 0) });
  setWindow(1180, 820);
  fake.log.length = 0;
  fake.activeMs = 0;
  fake.aborts.length = 0;
  fake.startArgs.length = 0;
  fake.finish = vi.fn(async () => undefined);
});

afterEach(() => {
  render(null, root);
  root.remove();
  vi.useRealTimers();
});

describe('TrainingScreen', () => {
  it('Tageslimit: zwei Sitzungen heute → Hinweis, Begrüßung und Limit-Ansage, kein Training', async () => {
    const exit = vi.fn();
    await mount({ db: fakeDb([session('a', TODAY), session('b', TODAY)]), onExit: exit });
    expect(root.textContent).toContain('Für heute ist genug, morgen geht es weiter.');
    expect(says()).toEqual(['say:greeting', 'say:dailyLimit']);
    expect(fake.startArgs).toHaveLength(0);
    await flush(1000);
    await tap();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('Tageslimit: Hinweis, wie es zurückgeht', async () => {
    await mount({ db: fakeDb([session('a', TODAY), session('b', TODAY)]) });
    const hint = root.querySelector('.message-hint');
    expect(hint?.textContent).toBe('Tippe, um zurückzugehen.');
  });

  it('Tageslimit: Tippen in der ersten Sekunde (Doppeltipp) verlässt den Hinweis nicht', async () => {
    const exit = vi.fn();
    await mount({ db: fakeDb([session('a', TODAY), session('b', TODAY)]), onExit: exit });
    await flush(500);
    await tap();
    expect(exit).not.toHaveBeenCalled();
    await flush(500);
    await tap();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('falsches Fenster beim Start: kein Lauf, Hinweis; nach dem Drehen geht es per Tippen los', async () => {
    setWindow(820, 1180);
    await mount();
    expect(says()).toEqual(['say:greeting', 'say:instruction']);
    expect(runs()).toBe(0);
    expect(fake.startArgs).toHaveLength(0);
    expect(root.textContent).toContain('Bitte das iPad quer halten.');
    await tap();
    expect(runs()).toBe(0);

    await act(async () => {
      setWindow(1180, 820);
      window.dispatchEvent(new Event('resize'));
    });
    await tap();
    expect(runs()).toBe(1);
  });

  it('Pausentakt: nach dem Weitermachen kommt die nächste Pause bei 10 Minuten aktiver Zeit', async () => {
    await mount();
    expect(fake.activeMs).toBe(300_000);
    expect(root.textContent).toContain('Kurze Pause');
    await flush(30_000);
    await tap();
    expect(runs()).toBe(2);
    expect(fake.activeMs).toBe(600_000);
    expect(root.textContent).toContain('Kurze Pause');
    expect(says().filter((s) => s === 'say:pauseStart')).toHaveLength(2);
  });

  it('Pausentakt: eine Unterbrechung bei 2 Minuten setzt den 5-Minuten-Abschnitt nicht zurück', async () => {
    fake.aborts.push(120_000);
    await mount();
    expect(fake.activeMs).toBe(120_000);
    expect(root.textContent).not.toContain('Kurze Pause');
    await tap();
    expect(runs()).toBe(2);
    expect(fake.activeMs).toBe(300_000);
    expect(root.textContent).toContain('Kurze Pause');
  });

  it('Einleitung: Begrüßung, dann Anleitung, erst danach der erste Lauf', async () => {
    await mount();
    expect(fake.log.slice(0, 3)).toEqual(['say:greeting', 'say:instruction', 'run']);
  });

  it('plant mit Fenstergröße der Einrichtung und Raster der Einstellungen, ohne feste Durchgangszahl', async () => {
    setWindow(1164, 804);
    await mount();
    expect(fake.startArgs).toHaveLength(1);
    const args = fake.startArgs[0] as { geometry: { viewportWidthPx: number; viewportHeightPx: number }; grid: unknown; trials?: number };
    expect(args.geometry.viewportWidthPx).toBe(1180);
    expect(args.geometry.viewportHeightPx).toBe(820);
    expect(args.grid).toBe(baseSettings.grid);
    expect(args.trials).toBeUndefined();
  });

  it('hängende Stimme: der erste Lauf beginnt erst, wenn die Anleitung sich erfüllt hat', async () => {
    await mount({ voice: fakeVoice({ instruction: 9000 }).voice });
    expect(says()).toEqual(['say:greeting', 'say:instruction']);
    expect(runs()).toBe(0);
    await flush(8000);
    expect(runs()).toBe(0);
    await flush(1000);
    expect(runs()).toBe(1);
  });

  it('geplante Pause: 30 s Mindestdauer, dann Ansage und Weitermachen per Tippen', async () => {
    await mount();
    expect(runs()).toBe(1);
    expect(root.textContent).toContain('Kurze Pause');
    expect(finishButton()).not.toBeNull();
    expect(says()).toContain('say:pauseStart');
    expect(root.textContent).not.toContain('Tippe zum Weitermachen.');

    await flush(10_000);
    await tap();
    expect(runs()).toBe(1);
    expect(says()).not.toContain('say:pauseReady');

    await flush(20_000);
    expect(says().filter((s) => s === 'say:pauseReady')).toHaveLength(1);
    expect(root.textContent).toContain('Tippe zum Weitermachen.');
    // weitere Ticks sagen nichts noch einmal
    await flush(5_000);
    expect(says().filter((s) => s === 'say:pauseReady')).toHaveLength(1);
    expect(says().filter((s) => s === 'say:pauseStart')).toHaveLength(1);

    await tap();
    expect(runs()).toBe(2);
  });

  it('„Fertig für heute“: Sitzung abschließen, Rückmeldung mit gestern, kein weiterer Lauf', async () => {
    const db = fakeDb(
      [session('heute', TODAY), session('gestern', YESTERDAY)],
      [...leftTrials('heute', 5, 8), ...leftTrials('gestern', 4, 9)],
    );
    const { voice, cancel } = fakeVoice();
    const exit = vi.fn();
    await mount({ db, voice, onExit: exit });
    expect(runs()).toBe(1);
    await tap(finishButton());
    expect(fake.finish).toHaveBeenCalledTimes(1);
    expect(runs()).toBe(1);
    expect(root.textContent).toContain('Heute gefunden');
    expect(root.textContent).toContain('5 von 8');
    expect(root.textContent).toContain('Gestern waren es 4.');
    const afterPause = says().slice(says().indexOf('say:end'));
    expect(afterPause).toEqual(['say:end', 'text:Heute 5 von 8 gefunden.', 'text:Gestern waren es 4.']);

    await flush(60_000);
    expect(runs()).toBe(1);
    await tap();
    expect(cancel).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('Sitzungsende lädt nur die Durchgänge der Sitzungen von heute und gestern, nie alle', async () => {
    const other: SessionRecord = { ...session('test', TODAY), kind: 'reference' };
    const db = fakeDb(
      [session('heute', TODAY), session('gestern', YESTERDAY), session('alt', '2026-10-01'), other],
      [...leftTrials('heute', 5, 8), ...leftTrials('gestern', 4, 9), ...leftTrials('alt', 9, 9), ...leftTrials('test', 7, 7)],
    );
    await mount({ db });
    await tap(finishButton());
    expect(root.textContent).toContain('5 von 8');
    expect(root.textContent).toContain('Gestern waren es 4.');
    expect(db.listTrials).toHaveBeenCalled();
    for (const call of db.listTrials.mock.calls) expect(call[0]).toBeDefined();
    expect(db.listTrials.mock.calls.map((c) => c[0]).sort()).toEqual(['gestern', 'heute']);
  });

  it('Rückmeldung: Tippen in der ersten Sekunde (Doppeltipp auf „Fertig für heute“) verlässt sie nicht', async () => {
    const exit = vi.fn();
    await mount({ db: fakeDb([session('heute', TODAY)], leftTrials('heute', 2, 3)), onExit: exit });
    await tap(finishButton());
    expect(root.textContent).toContain('Heute gefunden');
    await flush(500);
    await tap();
    expect(exit).not.toHaveBeenCalled();
    await flush(500);
    await tap();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('gestern nur eine Sitzung mit trialCount 0: Ermutigung, kein Vergleich mit gestern', async () => {
    // trialCount 0 trotz gespeicherter Durchgänge (offene Sitzung aus M2): zählt wie beim Tageslimit nicht
    const db = fakeDb([session('heute', TODAY), session('leer', YESTERDAY, 0)], [...leftTrials('heute', 2, 3), ...leftTrials('leer', 1, 2)]);
    await mount({ db });
    await tap(finishButton());
    expect(root.textContent).toContain('Schön, dass du dabei warst.');
    expect(root.textContent).not.toContain('Gestern');
    expect(says()).toContain('say:encouragement');
  });

  it('ohne gestern: Ermutigung als Folgesatz', async () => {
    const db = fakeDb([session('heute', TODAY)], leftTrials('heute', 2, 3));
    await mount({ db });
    await tap(finishButton());
    expect(root.textContent).toContain('Schön, dass du dabei warst.');
    expect(says().slice(says().indexOf('say:end'))).toEqual(['say:end', 'text:Heute 2 von 3 gefunden.', 'say:encouragement']);
  });

  it('Sitzungsende nach 10 Minuten aktiver Zeit: nach dem zweiten Lauf direkt Rückmeldung ohne Pause', async () => {
    await mount({ settings: { ...baseSettings, sessionMinutes: 10 } });
    expect(root.textContent).toContain('Kurze Pause');
    await flush(30_000);
    await tap();
    expect(runs()).toBe(2);
    expect(fake.finish).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('Heute gefunden');
    expect(root.textContent).not.toContain('Pause');
    expect(says().filter((s) => s === 'say:pauseStart')).toHaveLength(1);
  });

  it('geplante Pause, Fenster beim Weitermachen falsch: nach dem Drehen läuft ein voller neuer Abschnitt', async () => {
    // „Weitermachen“ hängt 5 s; in der Zeit wird gedreht, der Lauf scheitert an der Fensterprüfung
    await mount({ voice: fakeVoice({ pauseReady: 5000 }).voice });
    expect(fake.activeMs).toBe(300_000);
    await flush(30_000);
    expect(says()).toContain('say:pauseReady');
    await tap();
    await act(async () => {
      setWindow(820, 1180);
      window.dispatchEvent(new Event('resize'));
    });
    await flush(5000);
    expect(runs()).toBe(1);
    expect(root.textContent).toContain('Bitte das iPad quer halten.');

    await act(async () => {
      setWindow(1180, 820);
      window.dispatchEvent(new Event('resize'));
    });
    await tap();
    // Durchgänge laufen, keine sofortige zweite Pause
    expect(runs()).toBe(2);
    expect(fake.activeMs).toBe(600_000);
    expect(root.textContent).toContain('Kurze Pause');
  });

  it('Unterbrechung: „Pause“, Tippen geht sofort weiter', async () => {
    fake.aborts.push(60_000);
    await mount();
    expect(runs()).toBe(1);
    expect(root.textContent).toContain('Pause');
    expect(root.textContent).not.toContain('Kurze Pause');
    expect(root.textContent).toContain('Tippe zum Weitermachen.');
    expect(says()).not.toContain('say:pauseStart');
    await tap();
    expect(runs()).toBe(2);
  });

  it('Unterbrechung im Hochformat: Hinweis zum Drehen, Tippen startet nichts', async () => {
    fake.aborts.push(60_000);
    await mount();
    await act(async () => {
      setWindow(820, 1180);
      window.dispatchEvent(new Event('resize'));
    });
    expect(root.textContent).toContain('Bitte das iPad quer halten.');
    await tap();
    expect(runs()).toBe(1);

    await act(async () => {
      setWindow(900, 700);
      window.dispatchEvent(new Event('resize'));
    });
    expect(root.textContent).toContain('Bitte die App im Vollbild verwenden.');
    await tap();
    expect(runs()).toBe(1);
  });

  it('Verlassen bricht laufende Ansagen ab', async () => {
    const { voice, cancel } = fakeVoice();
    await mount({ voice });
    cancel.mockClear();
    render(null, root);
    expect(cancel).toHaveBeenCalled();
  });
});
