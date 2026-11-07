import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

/** The next element to focus when Tab moves through `count` elements from `current` (-1 for none). */
export function cycleFocus(count: number, current: number, backwards: boolean) {
  if (count === 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}

const STOPS = 'button, input, select, textarea, a[href], [tabindex="0"]';

/** The elements Tab visits inside `root`, in order. */
export function tabStops(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(STOPS)].filter((el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled);
}

/** Moves the focus on from the element that has it, wrapping at the ends, and returns whether it did. */
export function trapTab(root: HTMLElement, backwards: boolean) {
  const stops = tabStops(root);
  if (!stops.length) return false;
  stops[cycleFocus(stops.length, stops.indexOf(document.activeElement as HTMLElement), backwards)].focus();
  return true;
}

/**
 * For a dialog that covers the app: Tab stays inside the element the returned handler is on, and the focus goes back to
 * what had it before the dialog opened. Call it in the dialog's render, before anything inside takes the focus.
 */
export function useModalFocus() {
  const [opener] = useState(() => document.activeElement);
  useEffect(
    () => () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
    },
    [opener],
  );
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Tab" && trapTab(e.currentTarget, e.shiftKey)) e.preventDefault();
  };
}
