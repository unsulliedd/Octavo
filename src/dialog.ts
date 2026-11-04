/**
 * The app's own confirmations and messages. One shows at a time, above everything else; a request made while
 * one is open waits its turn. While one is open, the window's keys go to it alone.
 */

/** One button of a dialog: what picking it resolves to, its label, and its look. */
export interface Answer<T> {
  value: T;
  label: string;
  /** `primary` for the answer that goes ahead, `danger` for one that loses something. */
  look?: "primary" | "danger";
}

interface Request {
  text: string;
  answers: Answer<unknown>[];
  dismiss: unknown;
  resolve: (value: unknown) => void;
}

const waiting: Request[] = [];
let shown: { request: Request; root: HTMLElement; buttons: HTMLButtonElement[]; returnTo: Element | null } | undefined;
let count = 0;

/**
 * Shows `text` with one button per answer, the first one focused. Resolves to the value of the button picked,
 * or to `dismiss` on Escape or a click beside the dialog.
 */
export function choose<T>(text: string, answers: Answer<T>[], dismiss: T): Promise<T> {
  return new Promise((resolve) => {
    waiting.push({ text, answers, dismiss, resolve: resolve as (value: unknown) => void });
    if (!shown) showNext();
  });
}

/** A question with a confirming and a cancelling button: resolves to whether the first was picked. */
export const ask = (text: string, { okLabel = "OK", cancelLabel = "Cancel", danger = false } = {}) =>
  choose(text, [{ value: true, label: okLabel, look: danger ? "danger" : "primary" }, { value: false, label: cancelLabel }], false);

/** A message with one button: resolves once it is closed. */
export const message = (text: string, { okLabel = "OK" } = {}) =>
  choose<void>(text, [{ value: undefined, label: okLabel, look: "primary" }], undefined);

function showNext() {
  const request = waiting.shift();
  if (!request) return;
  const id = `app-dialog-${++count}`;
  const root = document.createElement("div");
  root.className = "app-dialog-backdrop";
  const box = document.createElement("section");
  box.className = "app-dialog";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", `${id}-title`);
  box.setAttribute("aria-describedby", `${id}-text`);
  const title = document.createElement("h2");
  title.id = `${id}-title`;
  title.textContent = "Octavo";
  const text = document.createElement("p");
  text.id = `${id}-text`;
  text.textContent = request.text;
  const row = document.createElement("div");
  row.className = "app-dialog-buttons";
  const buttons = request.answers.map((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.look ? `text-btn ${a.look}` : "text-btn";
    b.textContent = a.label;
    b.addEventListener("click", () => finish(a.value));
    return b;
  });
  row.append(...buttons);
  box.append(title, text, row);
  root.append(box);
  root.addEventListener("click", (e) => e.target === root && finish(request.dismiss));
  shown = { request, root, buttons, returnTo: document.activeElement };
  document.body.append(root);
  buttons[0]?.focus();
}

function finish(value: unknown) {
  if (!shown) return;
  const { request, root, returnTo } = shown;
  shown = undefined;
  root.remove();
  if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
  request.resolve(value);
  showNext();
}

/** Escape dismisses, Enter picks the focused button, Tab stays on the buttons; no other listener sees the key. */
function onKey(e: KeyboardEvent) {
  if (!shown) return;
  e.stopImmediatePropagation();
  const { buttons, request } = shown;
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === "Escape") finish(request.dismiss);
  else if (e.key === "Enter") (buttons[at] ?? buttons[0]).click();
  else if (e.key === "Tab") buttons[at < 0 ? 0 : (at + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
  // Space presses the focused button; Alt keys stay the system's.
  else if (e.key === " " || e.altKey) return;
  e.preventDefault();
}

// Added when the module loads, before any view adds its own, so it runs first.
window.addEventListener("keydown", onKey, true);
