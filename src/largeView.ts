// Opening diagrams, images and tables large from the reading view: what a click opens, the title the large view
// shows, the copy it shows, and the buttons that open them.

import { EXPAND_PATH } from "./icons";
import { safeDecode } from "./paths";

export type Size = { width: number; height: number };

/** What the large view shows: a copy of a diagram's drawing, an image, or a copy of a table. */
export type LargeContent =
  | { kind: "diagram"; title: string; markup: string }
  | { kind: "image"; title: string; src: string; alt: string; size?: Size }
  | { kind: "table"; title: string; markup: string };

/** An open button's side and its distance from the top and right edges of what it opens, in px. */
const BUTTON = 28;
const INSET = 6;

/** The text of the nearest heading before `el` in `root`; `fallback` when there is none. */
export function headingBefore(root: Element, el: Element, fallback: string) {
  let title = "";
  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!(heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    title = (heading.textContent ?? "").replace(/\s+/g, " ").trim() || title;
  }
  return title || fallback;
}

/** The file name an image source ends in, decoded; empty for an inline image. */
export function fileName(src: string) {
  if (/^(data|blob):/i.test(src)) return "";
  return safeDecode(src.split(/[?#]/)[0]).split(/[\\/]/).filter(Boolean).pop() ?? "";
}

/** An image's title: its alt text, else the name of its file, else "Image". */
export const imageTitle = (alt: string, src: string) => alt.trim() || fileName(src) || "Image";

/**
 * A drawing's markup with the ids of its root `<svg>` renamed, along with every reference to them, so the copy
 * and the original in the document don't share ids.
 */
export function uniqueIds(markup: string, suffix: string) {
  const id = /^<svg\b[^>]*?\sid="([^"]+)"/.exec(markup)?.[1];
  if (!id) return markup;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The digit check keeps `mermaid-1` from matching the start of `mermaid-12`.
  return markup.replace(new RegExp(`${escaped}(?!\\d)`, "g"), `${id}-${suffix}`);
}

/** A copy of a table's markup as it is shown large: without resize handles or hand-set column widths. */
export function tableMarkup(table: HTMLTableElement) {
  const copy = table.cloneNode(true) as HTMLTableElement;
  for (const handle of copy.querySelectorAll(".col-resize")) handle.remove();
  copy.classList.remove("sized", "resizing");
  copy.style.width = "";
  for (const cell of copy.querySelectorAll<HTMLElement>("th, td")) cell.style.width = "";
  return copy.outerHTML;
}

const tableContent = (root: Element, table: HTMLTableElement): LargeContent => ({ kind: "table", title: headingBefore(root, table, "Table"), markup: tableMarkup(table) });

function diagramContent(root: Element, diagram: Element): LargeContent | undefined {
  const svg = diagram.querySelector("svg");
  return svg ? { kind: "diagram", title: headingBefore(root, diagram, "Diagram"), markup: uniqueIds(svg.outerHTML, "large") } : undefined;
}

function imageContent(img: HTMLImageElement): LargeContent {
  const src = img.currentSrc || img.src;
  const size = img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : undefined;
  return { kind: "image", title: imageTitle(img.alt, img.dataset.src ?? img.getAttribute("src") ?? ""), src, alt: img.alt, size };
}

/**
 * What a click on `target`, inside the reading view `root`, opens large: whatever an open button belongs to (a table,
 * a diagram or an image), and with `click`, a rendered diagram or an image that isn't inside a link. Nothing while
 * editing, and no diagram or image from a click on it while text is being selected.
 */
export function largeContent(
  target: Element,
  root: Element,
  state: { editing: boolean; selecting: boolean; click: boolean },
): LargeContent | undefined {
  if (state.editing || !root.contains(target)) return undefined;
  const button = target.closest(".large-open");
  if (button) {
    const table = button.closest(".table-scroll")?.querySelector<HTMLTableElement>(":scope > table");
    if (table) return tableContent(root, table);
    const diagram = button.closest(".mermaid");
    if (diagram) return diagramContent(root, diagram);
    const img = button.closest(".large-frame")?.querySelector("img");
    return img ? imageContent(img) : undefined;
  }
  if (!state.click || state.selecting) return undefined;
  const diagram = target.closest(".mermaid");
  if (diagram) return diagramContent(root, diagram);
  const img = target.closest("img");
  return img && !img.closest("a") ? imageContent(img) : undefined;
}

/**
 * The table button's distance from the left edge of its scrolling box: at the table's right edge, or at the right
 * edge of the visible part when the table is wider than the box, never closer than the inset to the left edge.
 */
export function buttonLeft(tableWidth: number, boxWidth: number, scrollLeft: number) {
  return Math.max(INSET, Math.min(tableWidth, boxWidth + scrollLeft) - BUTTON - INSET);
}

/** The next element to focus when Tab moves through `count` elements from `current` (-1 for none). */
export function cycleFocus(count: number, current: number, backwards: boolean) {
  if (count === 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}

/** A button that opens `what` large, with the expand icon; clicks on it are handled through `largeContent`. */
function openButton(doc: Document, what: string) {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "large-open";
  button.setAttribute("aria-label", `Open the ${what} large`);
  button.title = "Open large";
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", EXPAND_PATH);
  svg.append(path);
  button.append(svg);
  return button;
}

/**
 * Adds a button that opens it large to every table in `root`, and with `media` to every rendered diagram and every
 * image that isn't inside a link, at its top right corner. A button shows while the pointer is over what it opens
 * or the button has focus (see `.large-open` in styles.css). An image is wrapped in a `.large-frame` to hold its
 * button. Returns a function that removes the buttons and the frames.
 */
export function addOpenButtons(root: HTMLElement, media: boolean) {
  const undo: (() => void)[] = [];
  const doc = root.ownerDocument;
  for (const box of root.querySelectorAll<HTMLElement>(".table-scroll")) {
    const table = box.querySelector<HTMLElement>(":scope > table");
    if (!table || box.querySelector(":scope > .large-open")) continue;
    const button = openButton(doc, "table");
    box.append(button);
    // A table can be wider than its box, which scrolls sideways; the button stays at the visible right edge.
    const place = () => {
      button.style.left = `${buttonLeft(table.offsetWidth, box.clientWidth, box.scrollLeft)}px`;
    };
    place();
    box.addEventListener("scroll", place, { passive: true });
    const observer = new ResizeObserver(place);
    observer.observe(box);
    observer.observe(table);
    undo.push(() => {
      box.removeEventListener("scroll", place);
      observer.disconnect();
      button.remove();
    });
  }
  if (!media) return () => undo.forEach((f) => f());
  for (const diagram of root.querySelectorAll<HTMLElement>(".mermaid")) {
    if (!diagram.querySelector("svg") || diagram.querySelector(":scope > .large-open")) continue;
    const button = openButton(doc, "diagram");
    diagram.append(button);
    undo.push(() => button.remove());
  }
  for (const img of root.querySelectorAll("img")) {
    if (img.closest("a, .large-frame")) continue;
    const frame = doc.createElement("span");
    frame.className = "large-frame";
    const button = openButton(doc, "image");
    img.replaceWith(frame);
    frame.append(img, button);
    undo.push(() => frame.isConnected && frame.replaceWith(...[...frame.childNodes].filter((n) => n !== button)));
  }
  return () => undo.forEach((f) => f());
}
