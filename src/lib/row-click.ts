/**
 * The result table's row-as-link behaviour (ResultTable.tsx): the whole `<tr>` navigates on click, but
 * a real `<a>` still wraps the name so keyboard and screen-reader users, and ctrl/middle-click, keep
 * working exactly as before. No DOM here — this is the pure decision the row's onClick handler defers
 * to, kept separate so it can be unit-tested without mounting anything.
 */
export interface ClickModifiers {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** True for an unmodified left click: the one case where the row's own handler should act (push the
 * route) instead of leaving the click alone. Anything else — a modifier held (ctrl/meta open a new
 * tab, shift/alt have their own browser meanings) or a non-primary button — is left untouched, the
 * same way a plain `<a>` would leave it untouched. */
export function isPlainLeftClick(event: ClickModifiers): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}
