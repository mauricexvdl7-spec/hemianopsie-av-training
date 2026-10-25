import { describe, it, expect, vi } from 'vitest';
import { canFullscreen, enterFullscreen } from '../../src/ui/fullscreen';

function fakeDoc(opts: { enabled: boolean; active?: boolean; reject?: boolean; throws?: boolean }) {
  const requestFullscreen = vi.fn(() => {
    if (opts.throws) throw new Error('nein');
    return opts.reject ? Promise.reject(new Error('verweigert')) : Promise.resolve();
  });
  return {
    doc: { fullscreenEnabled: opts.enabled, fullscreenElement: opts.active ? {} : null, documentElement: { requestFullscreen } } as unknown as Document,
    requestFullscreen,
  };
}

describe('Vollbild', () => {
  it('fordert Vollbild an, wenn möglich und noch nicht aktiv', () => {
    const { doc, requestFullscreen } = fakeDoc({ enabled: true });
    enterFullscreen(doc);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
  it('nichts tun, wenn schon Vollbild oder nicht unterstützt (iPad)', () => {
    const a = fakeDoc({ enabled: true, active: true });
    enterFullscreen(a.doc);
    expect(a.requestFullscreen).not.toHaveBeenCalled();
    const b = fakeDoc({ enabled: false });
    enterFullscreen(b.doc);
    expect(b.requestFullscreen).not.toHaveBeenCalled();
    expect(canFullscreen(b.doc)).toBe(false);
    expect(canFullscreen(a.doc)).toBe(false);
  });
  it('wirft nie, auch wenn der Browser ablehnt', async () => {
    expect(() => enterFullscreen(fakeDoc({ enabled: true, throws: true }).doc)).not.toThrow();
    expect(() => enterFullscreen(fakeDoc({ enabled: true, reject: true }).doc)).not.toThrow();
    await Promise.resolve();
  });
  it('canFullscreen: unterstützt und noch nicht aktiv', () => {
    expect(canFullscreen(fakeDoc({ enabled: true }).doc)).toBe(true);
  });
});
