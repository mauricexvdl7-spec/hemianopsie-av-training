/** Unsichtbare Fläche oben rechts im Startbildschirm: 3 s gedrückt halten öffnet den Bereich für Angehörige. */
import { useEffect, useRef } from 'preact/hooks';

export const ADMIN_HOLD_MS = 3000;

export function AdminCorner(props: { onLongPress(): void; holdMs?: number }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  return (
    <div
      class="admin-corner"
      role="button"
      aria-label="Bereich für Angehörige"
      onPointerDown={(e) => {
        // Der Startbildschirm darf weder Druck noch Klick aus der Ecke sehen
        e.stopPropagation();
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          props.onLongPress();
        }, props.holdMs ?? ADMIN_HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
