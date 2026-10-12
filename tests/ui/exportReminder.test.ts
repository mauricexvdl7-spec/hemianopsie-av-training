import { describe, it, expect } from 'vitest';
import { EXPORT_REMINDER_DAYS, exportReminderDue } from '../../src/ui/admin/exportReminder';

const DAY = 86_400_000;
const d = new Date('2026-10-12T10:00:00.000Z');
const ago = (days: number) => new Date(d.getTime() - days * DAY).toISOString();

describe('exportReminderDue', () => {
  it('nie exportiert: nur fällig, wenn es Trainingssitzungen gibt', () => {
    expect(exportReminderDue(null, d, false)).toBe(false);
    expect(exportReminderDue(null, d, true)).toBe(true);
  });

  it('fällig ab 30 Tagen seit dem letzten Export', () => {
    expect(EXPORT_REMINDER_DAYS).toBe(30);
    expect(exportReminderDue(ago(29), d, true)).toBe(false);
    expect(exportReminderDue(ago(30), d, true)).toBe(true);
    expect(exportReminderDue(ago(45), d, true)).toBe(true);
  });

  it('ohne Trainingssitzungen nie fällig', () => {
    expect(exportReminderDue(ago(45), d, false)).toBe(false);
  });
});
