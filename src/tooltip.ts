// The app's tooltip. Any element with a `data-tip` attribute shows its text after a short hover, or at once when
// it gets the keyboard focus. Escape, a click, scrolling or leaving the element hides it. Screen readers don't
// read the tip itself: an element with no name of its own gives the text as its `aria-label` too, and one that
// has a name gives it as `aria-description`.

/** How long the pointer rests on an element before its tip shows, in milliseconds. */
export const TIP_DELAY = 500;
/** The space between the element and its tip. */
const GAP = 6;
/** The tip keeps this far from the window's edges. */
const MARGIN = 8;

type Box = { left: number; top: number; right: number; bottom: number };
type Size = { width: number; height: number };

/** Where a tip goes: centred below its element, above it when it doesn't fit below, and always inside the window. */
export function placeTip(anchor: Box, tip: Size, view: Size) {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - tip.height;
  const side = below + tip.height <= view.height - MARGIN || above < MARGIN ? "below" : "above";
  const top = Math.max(MARGIN, Math.min(side === "below" ? below : above, view.height - MARGIN - tip.height));
  const centred = (anchor.left + anchor.right - tip.width) / 2;
  const left = Math.max(MARGIN, Math.min(centred, view.width - MARGIN - tip.width));
  return { left, top, side } as const;
}

const KEYS = /^(.+) \(((?:(?:Ctrl|Shift|Alt|Win)\+)+\S+|Escape|F\d{1,2})\)$/;

/** A tip's text and the keys at its end, as `withKeys` writes them: "Save (Ctrl+S)" is "Save" and "Ctrl+S". */
export function splitKeys(text: string): { label: string; keys?: string } {
  const match = KEYS.exec(text);
  return match ? { label: match[1], keys: match[2] } : { label: text };
}

/** The attributes of an element that has a name of its own and `text` as its tip. */
export const described = (text: string | undefined) => ({ "data-tip": text, "aria-description": text });

/** Whether the element has the keyboard focus, rather than focus from a click. */
function keyboardFocus(el: Element) {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** Shows `data-tip` texts in one tooltip element for the whole document. Returns a function that removes it. */
export function installTooltips(doc: Document = document, delay = TIP_DELAY) {
  const view = doc.defaultView!;
  const tip = doc.createElement("div");
  tip.className = "app-tip";
  tip.setAttribute("aria-hidden", "true");
  tip.hidden = true;
  doc.body.append(tip);
  let shown: HTMLElement | undefined;
  let waiting: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const hide = () => {
    clearTimeout(timer);
    shown = waiting = undefined;
    tip.hidden = true;
  };
  const show = (el: HTMLElement) => {
    hide();
    const text = el.dataset.tip;
    if (!text || !el.isConnected) return;
    const { label, keys } = splitKeys(text);
    tip.replaceChildren(label);
    if (keys) tip.append(Object.assign(doc.createElement("kbd"), { textContent: keys }));
    tip.hidden = false;
    const { left, top, side } = placeTip(el.getBoundingClientRect(), { width: tip.offsetWidth, height: tip.offsetHeight }, { width: view.innerWidth, height: view.innerHeight });
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
    tip.dataset.side = side;
    shown = el;
  };
  const tipped = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null);

  const over = (e: Event) => {
    const el = tipped(e.target);
    if (!el || el === shown || el === waiting) return;
    hide();
    waiting = el;
    timer = setTimeout(() => show(el), delay);
  };
  const out = (e: MouseEvent) => {
    const current = shown ?? waiting;
    if (current && !(e.relatedTarget instanceof Node && current.contains(e.relatedTarget))) hide();
  };
  const focus = (e: Event) => {
    const el = tipped(e.target);
    if (el && keyboardFocus(e.target as Element)) show(el);
  };
  const blur = (e: Event) => {
    if (shown && tipped(e.target) === shown) hide();
  };
  const key = (e: KeyboardEvent) => e.key === "Escape" && hide();

  const listeners: [string, EventListener][] = [
    ["mouseover", over],
    ["mouseout", out as EventListener],
    ["focusin", focus],
    ["focusout", blur],
    ["keydown", key as EventListener],
    ["pointerdown", hide],
    ["wheel", hide],
    ["scroll", hide],
  ];
  for (const [type, listener] of listeners) doc.addEventListener(type, listener, true);
  view.addEventListener("blur", hide);
  return () => {
    hide();
    for (const [type, listener] of listeners) doc.removeEventListener(type, listener, true);
    view.removeEventListener("blur", hide);
    tip.remove();
  };
}
