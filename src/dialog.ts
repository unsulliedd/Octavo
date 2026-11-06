/**
 * The app's own confirmations, messages and name prompts. One shows at a time, above everything else; a request made
 * while one is open waits its turn. While one is open, the window's keys go to it alone.
 */

/** One button of a dialog: what picking it resolves to, its label, and its look. */
export interface Answer<T> {
  value: T;
  label: string;
  /** `primary` for the answer that goes ahead, `danger` for one that loses something. */
  look?: "primary" | "danger";
}

interface Request {
  title: string;
  text: string;
  answers: Answer<unknown>[];
  dismiss: unknown;
  resolve: (value: unknown) => void;
  /** A text field above the text, whose trimmed value the first button resolves to. */
  field?: { label: string; value: string };
}

/** The value of the button that confirms a prompt: it stands for what the field holds. */
const TYPED = Symbol("typed");

const waiting: Request[] = [];
let shown: { request: Request; root: HTMLElement; buttons: HTMLButtonElement[]; input?: HTMLInputElement; returnTo: Element | null } | undefined;
let count = 0;

function show(request: Omit<Request, "resolve">) {
  return new Promise<unknown>((resolve) => {
    waiting.push({ ...request, resolve });
    if (!shown) showNext();
  });
}

/**
 * Shows `text` with one button per answer, the first one focused. Resolves to the value of the button picked,
 * or to `dismiss` on Escape or a click beside the dialog.
 */
export const choose = <T>(text: string, answers: Answer<T>[], dismiss: T, { title = "Octavo" } = {}) => show({ title, text, answers, dismiss }) as Promise<T>;

/** A question with a confirming and a cancelling button: resolves to whether the first was picked. */
export const ask = (text: string, { okLabel = "OK", cancelLabel = "Cancel", danger = false, title = "Octavo" } = {}) =>
  choose(text, [{ value: true, label: okLabel, look: danger ? "danger" : "primary" }, { value: false, label: cancelLabel }], false, { title });

/** A message with one button: resolves once it is closed. */
export const message = (text: string, { okLabel = "OK", title = "Octavo" } = {}) =>
  choose<void>(text, [{ value: undefined, label: okLabel, look: "primary" }], undefined, { title });

/**
 * Asks for a short text such as a name, starting from `value`, with `text` under the field. Resolves to what was
 * typed, trimmed, or to `undefined` on Cancel, Escape or a click beside the dialog. OK waits for a text that isn't blank.
 */
export const promptText = (text: string, { title = "Octavo", value = "", okLabel = "OK" } = {}) =>
  show({ title, text, field: { label: "Name", value }, answers: [{ value: TYPED, label: okLabel, look: "primary" }, { value: undefined, label: "Cancel" }], dismiss: undefined }) as Promise<string | undefined>;

function showNext() {
  const request = waiting.shift();
  if (!request) return;
  const id = `app-dialog-${++count}`;
  const root = document.createElement("div");
  root.className = "app-dialog-backdrop";
  const box = document.createElement("section");
  box.className = "app-dialog";
  box.setAttribute("role", request.field ? "dialog" : "alertdialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", `${id}-title`);
  const title = document.createElement("h2");
  title.id = `${id}-title`;
  title.textContent = request.title;
  box.append(title);
  let input: HTMLInputElement | undefined;
  if (request.field) {
    const field = document.createElement("div");
    field.className = "app-dialog-field";
    const label = document.createElement("label");
    label.htmlFor = `${id}-field`;
    label.textContent = request.field.label;
    input = document.createElement("input");
    input.id = `${id}-field`;
    input.type = "text";
    input.spellcheck = false;
    input.value = request.field.value;
    field.append(label, input);
    box.append(field);
  }
  if (request.text) {
    const text = document.createElement("p");
    text.id = `${id}-text`;
    text.textContent = request.text;
    box.setAttribute("aria-describedby", text.id);
    box.append(text);
  }
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
  if (input) {
    const typed = input;
    const ok = buttons[0];
    const check = () => void (ok.disabled = !typed.value.trim());
    typed.addEventListener("input", check);
    check();
  }
  row.append(...buttons);
  box.append(row);
  root.append(box);
  root.addEventListener("click", (e) => e.target === root && finish(request.dismiss));
  shown = { request, root, buttons, input, returnTo: document.activeElement };
  document.body.append(root);
  if (input) {
    input.focus();
    input.select();
  } else {
    buttons[0]?.focus();
  }
}

function finish(value: unknown) {
  if (!shown) return;
  const { request, root, input, returnTo } = shown;
  shown = undefined;
  root.remove();
  if (returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
  request.resolve(value === TYPED ? input!.value.trim() : value);
  showNext();
}

/** Keys that edit or move in a text field. */
const EDITING = /^(Backspace|Delete|Arrow(Left|Right|Up|Down)|Home|End)$/;
/** Whether `e` types or edits in the field: a character, an editing key, or Ctrl with A, C, V, X, Y or Z. */
const typing = (e: KeyboardEvent) => EDITING.test(e.key) || (e.key.length === 1 && (!(e.ctrlKey || e.metaKey) || /^[acvxyz]$/i.test(e.key)));

/**
 * Escape dismisses, Enter confirms in the field or picks the focused button, Tab stays on the field and the buttons;
 * no other listener sees the key. In the field, keys that type or edit do so.
 */
function onKey(e: KeyboardEvent) {
  if (!shown) return;
  e.stopImmediatePropagation();
  if (e.isComposing) return;
  const { buttons, request, input } = shown;
  const stops: HTMLElement[] = [...(input ? [input] : []), ...buttons.filter((b) => !b.disabled)];
  const at = stops.indexOf(document.activeElement as HTMLElement);
  const inField = !!input && document.activeElement === input;
  if (e.key === "Escape") finish(request.dismiss);
  // A disabled OK ignores the click.
  else if (e.key === "Enter") (inField ? buttons[0] : (buttons.find((b) => b === document.activeElement) ?? buttons[0])).click();
  else if (e.key === "Tab") stops[at < 0 ? 0 : (at + (e.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
  // Space presses the focused button; Alt keys stay the system's.
  else if (e.key === " " || e.altKey || (inField && typing(e))) return;
  e.preventDefault();
}

// Added when the module loads, before any view adds its own, so it runs first.
window.addEventListener("keydown", onKey, true);
