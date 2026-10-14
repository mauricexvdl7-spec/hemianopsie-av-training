import { describe, it, expect } from 'vitest';
import { placementHint, SIDE_EXPECTS_FACE_X } from '../../src/ui/admin/placement';

/** x der Nase in der Bildhälfte, in der das Gesicht bei 'side' nicht liegen soll. */
const wrongX = SIDE_EXPECTS_FACE_X === 'high' ? 0.2 : 0.8;
const rightX = SIDE_EXPECTS_FACE_X === 'high' ? 0.8 : 0.2;

describe('placementHint', () => {
  it('ohne Gesicht: Hinweis „Kein Gesicht“ (beide Lagen)', () => {
    expect(placementHint('side', null)).toMatch(/Kein Gesicht/);
    expect(placementHint('top', null)).toMatch(/Kein Gesicht/);
  });

  it("'side': Gesicht mittig oder in der erwarteten Hälfte → kein Hinweis", () => {
    expect(placementHint('side', { x: 0.5, y: 0.5 })).toBeNull();
    expect(placementHint('side', { x: rightX, y: 0.5 })).toBeNull();
  });

  it("'side': Gesicht in der falschen Hälfte → Kamera rechts", () => {
    expect(placementHint('side', { x: wrongX, y: 0.5 })).toMatch(/Kamera rechts/);
  });

  it("'side': bis 0,15 jenseits der Mitte noch kein Hinweis", () => {
    const sign = SIDE_EXPECTS_FACE_X === 'high' ? -1 : 1;
    expect(placementHint('side', { x: 0.5 + sign * 0.14, y: 0.5 })).toBeNull();
    expect(placementHint('side', { x: 0.5 + sign * 0.16, y: 0.5 })).toMatch(/Kamera rechts/);
  });

  it("'top': Nase vertikal außerhalb 0,25–0,75 → Hinweis", () => {
    expect(placementHint('top', { x: 0.5, y: 0.9 })).toBe('Bitte das iPad gerade vor das Gesicht stellen.');
    expect(placementHint('top', { x: 0.5, y: 0.1 })).toBe('Bitte das iPad gerade vor das Gesicht stellen.');
    expect(placementHint('top', { x: 0.5, y: 0.5 })).toBeNull();
    expect(placementHint('top', { x: 0.1, y: 0.5 })).toBeNull();
  });
});
