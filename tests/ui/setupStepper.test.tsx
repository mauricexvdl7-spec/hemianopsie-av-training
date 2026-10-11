// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from 'preact';
import { Stepper } from '../../src/ui/setup/SetupWizard';

describe('Stepper', () => {
  it('zeigt „Schritt 2 von 4“ und markiert erledigte, aktuelle und offene Punkte', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(<Stepper index={1} count={4} />, root);
    expect(root.textContent).toBe('Schritt 2 von 4');
    const dots = [...root.querySelectorAll('.stepper-dots span')].map((d) => d.className);
    expect(dots).toEqual(['done', 'current', '', '']);
    render(null, root);
    root.remove();
  });
});
