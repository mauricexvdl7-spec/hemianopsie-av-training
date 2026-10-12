// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render } from 'preact';
import { createControllerState } from '../../src/core/controller';
import { makeGeometry } from '../../src/core/geometry';
import { openDb, type Db } from '../../src/store/db';
import { ReportPage } from '../../src/ui/admin/ReportPage';
import { DISCLAIMER_TEXT } from '../../src/ui/setup/steps/Disclaimer';

let n = 0;
const settle = () => new Promise((r) => setTimeout(r, 10));
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await settle();
};
const button = (el: Element, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text)!;

async function mount(seed?: (db: Db) => Promise<void>) {
  const db = await openDb(`report-${n++}`);
  await seed?.(db);
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(<ReportPage db={db} now={new Date(2026, 9, 12, 9, 0)} />, root);
  await until(() => root.textContent!.includes('Ende des Monats'));
  return { root, db };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('ReportPage', () => {
  it('zeigt Titel, Zeitraum und den Hinweis', async () => {
    const { root } = await mount();
    expect(root.textContent).toContain('Monatsbericht Oktober 2026');
    expect(root.textContent).toContain('1.10.2026 – 31.10.2026');
    expect(root.textContent).toContain(DISCLAIMER_TEXT);
    expect(root.textContent).toContain('Anfang des Monats');
    expect(root.textContent).toContain('Ende des Monats');
  });

  it('zeigt Kennzahlen und Karten aus den gespeicherten Daten', async () => {
    const { root } = await mount(async (db) => {
      await db.addSession({
        id: 's1',
        startedAtIso: '2026-10-05T10:00:00.000Z',
        endedAtIso: null,
        dayKey: '2026-10-05',
        kind: 'training',
        trialCount: 3,
        summary: { stage: '2', durationMin: 24, meanLeftLevel: 6, leftHitRate: 0.5 },
        stage: '2',
      });
      const state = createControllerState(makeGeometry({ screenWidthCm: 24, viewingDistanceCm: 30, fixationXFraction: 2 / 3, fixationYFraction: 0.5 }, 1180, 820));
      await db.addMapSnapshot({ id: 's1:sessionEnd', sessionId: 's1', atIso: '2026-10-05T10:30:00', gridSignature: 'x', map: state.map, stage: '2', reason: 'sessionEnd' });
    });
    await until(() => root.querySelectorAll('svg').length === 2);
    expect(root.textContent).toContain('Sitzungen: 1');
    expect(root.textContent).toContain('Übungszeit: 24 Minuten');
    expect(root.textContent).toContain('Phase am Monatsende: 2');
    expect(root.textContent).toContain('Stand: 5.10.2026');
  });

  it('Knopf druckt', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const { root } = await mount();
    button(root, 'Drucken oder als PDF sichern').click();
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('Vormonat und Folgemonat', async () => {
    const { root } = await mount();
    button(root, '‹ Vormonat').click();
    await until(() => root.textContent!.includes('Ende des Monats') && root.textContent!.includes('September'));
    expect(root.textContent).toContain('Monatsbericht September 2026');
    expect(root.textContent).toContain('1.9.2026 – 30.9.2026');
    button(root, 'Folgemonat ›').click();
    await until(() => root.textContent!.includes('Monatsbericht Oktober'));
    expect(root.textContent).toContain('Monatsbericht Oktober 2026');
  });

  it('Navigation und Knöpfe sind im Druck ausgeblendet', async () => {
    const { root } = await mount();
    for (const label of ['Zurück', '‹ Vormonat', 'Folgemonat ›', 'Drucken oder als PDF sichern']) {
      expect(button(root, label).closest('.no-print')).not.toBeNull();
    }
  });
});
