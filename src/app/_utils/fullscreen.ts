/**
 * Helpers to make an element truly full-screen even when it lives inside a
 * transformed/scrollable ancestor (e.g. a bottom-sheet modal).
 *
 * A `position: fixed` element is positioned relative to the nearest ancestor
 * that has a transform/filter, so inside an animated modal it stays bound to the
 * sheet and scrolls/drags with it. Moving the element to <body> escapes that,
 * and locking body scroll stops the page behind from moving.
 */

/** Move `el` to <body>, leaving a placeholder to restore it later. Locks scroll. */
export function teleportToBody(el: HTMLElement): Comment {
  const placeholder = document.createComment('fs-placeholder');
  el.parentNode?.insertBefore(placeholder, el);
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  return placeholder;
}

/** Return `el` to its original spot (where the placeholder is) and unlock scroll. */
export function restoreFromBody(
  el: HTMLElement,
  placeholder: Comment | null,
): void {
  if (placeholder?.parentNode) {
    placeholder.parentNode.replaceChild(el, placeholder);
  }
  document.body.style.overflow = '';
}
