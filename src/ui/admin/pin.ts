/** PIN für den Bereich der Angehörigen: genau 4 Ziffern, gesalzen mit SHA-256 gehasht (nur auf dem Gerät). */
import type { PinRecord } from '../../store/db';

const SALT_BYTES = 16;

export const isValidPin = (pin: string): boolean => /^\d{4}$/.test(pin);

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** SHA-256 über UTF-8(saltHex + pin), als hex. */
export async function hashPin(pin: string, saltHex: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(saltHex + pin));
  return toHex(new Uint8Array(digest));
}

/** Neues Salz aus 16 Zufallsbytes und Hash der PIN. */
export async function createPinRecord(
  pin: string,
  randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): Promise<PinRecord> {
  const saltHex = toHex(randomBytes(SALT_BYTES));
  return { saltHex, hashHex: await hashPin(pin, saltHex) };
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  return (await hashPin(pin, rec.saltHex)) === rec.hashHex;
}
