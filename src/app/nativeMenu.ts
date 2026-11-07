// The webview's own right-click menu (Back, Refresh, Save as, Print…) is hidden everywhere except where text is typed.

/** Input types that take no typed text, whose default menu has nothing to offer. */
const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"]);

/** Whether `target` is a place where text is typed: a text field, the editor or Source mode. */
export function takesText(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const input = target.closest("input");
  if (input) return !NOT_TEXT.has(input.type);
  return !!target.closest('textarea, .cm-editor, [contenteditable]:not([contenteditable="false"])');
}

/** Stops the default menu from opening on a right click outside text fields; the app's own menus call preventDefault themselves. */
export function hideNativeMenu(e: Event) {
  if (!takesText(e.target)) e.preventDefault();
}

/** Applies `hideNativeMenu` to the whole document. Returns a function that stops it. */
export function installNativeMenuGuard(doc: Document = document) {
  doc.addEventListener("contextmenu", hideNativeMenu);
  return () => doc.removeEventListener("contextmenu", hideNativeMenu);
}
