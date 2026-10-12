import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createPinRecord, hashPin, isValidPin, verifyPin } from '../../src/ui/admin/pin';

describe('PIN', () => {
  it('hashPin: SHA-256 über Salz + PIN als hex', async () => {
    expect(await hashPin('1234', '00')).toBe(createHash('sha256').update('001234').digest('hex'));
  });

  it('createPinRecord: 16 Zufallsbytes als hex-Salz', async () => {
    const rec = await createPinRecord('1234', (n) => new Uint8Array(n).fill(171));
    expect(rec.saltHex).toBe('ab'.repeat(16));
    expect(rec.hashHex).toBe(createHash('sha256').update('ab'.repeat(16) + '1234').digest('hex'));
  });

  it('createPinRecord ohne eigene Zufallsquelle: Salz 32 hex-Zeichen', async () => {
    const rec = await createPinRecord('1234');
    expect(rec.saltHex).toMatch(/^[0-9a-f]{32}$/);
  });

  it('verifyPin: richtige PIN true, falsche false', async () => {
    const rec = await createPinRecord('1234');
    expect(await verifyPin('1234', rec)).toBe(true);
    expect(await verifyPin('1235', rec)).toBe(false);
  });

  it('isValidPin: genau 4 Ziffern', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('0000')).toBe(true);
    for (const p of ['123', '12345', '12a4', '', ' 123']) expect(isValidPin(p)).toBe(false);
  });
});
