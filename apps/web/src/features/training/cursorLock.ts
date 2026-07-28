const CURSOR_LOCK_CLASS = 'trainer-dragging-level';

// Reference-counted: the pill drag and the line drag can both be live for the same gesture, and
// whichever finishes first must not drop the lock while the other is still holding it.
let held = 0;

export function beginCursorLock(): void {
  held += 1;
  if (held === 1) document.body.classList.add(CURSOR_LOCK_CLASS);
}

export function endCursorLock(): void {
  held = Math.max(0, held - 1);
  if (held === 0) document.body.classList.remove(CURSOR_LOCK_CLASS);
}
