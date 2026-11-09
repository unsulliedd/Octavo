// Task list boxes in the reading view: where each box is in the file, and ticking it there.

import type { Element, Root } from "hast";

type Mdast = { type: string; checked?: boolean | null; position?: { start: { offset?: number } }; children?: Mdast[] };

const BOX = /^\[[ xX]\]$/;

/** Where the `[ ]`, `[x]` or `[X]` before a task item's text starts: `text` is where the text starts. */
function boxBefore(md: string, text: number) {
  let end = text;
  while (end > 0 && /[\s>]/.test(md[end - 1])) end--;
  return BOX.test(md.slice(end - 3, end)) ? end - 3 : undefined;
}

/**
 * Where the box of each task item in `tree` starts in `file`, by where the item starts in `md`, the text
 * `tree` was parsed from: `file` with a backslash put before some `$` (parseMarkdown).
 */
export function taskOffsets(md: string, tree: unknown, file: string) {
  const found = new Map<number, number>();
  const walk = (node: Mdast) => {
    const item = node.position?.start.offset;
    const text = node.children?.[0]?.position?.start.offset;
    if (node.type === "listItem" && typeof node.checked === "boolean" && item !== undefined && text !== undefined) {
      const box = boxBefore(md, text);
      if (box !== undefined && box >= item) found.set(item, box);
    }
    node.children?.forEach(walk);
  };
  walk(tree as Mdast);
  if (md === file || !found.size) return found;
  // Each added backslash stands right before a `$` the file has there, so the texts match up to it.
  const added: number[] = [];
  for (let i = 0, j = 0; i < md.length; i++) {
    if (md[i] === file[j]) j++;
    else added.push(i);
  }
  const inFile = (at: number) => at - added.filter((a) => a < at).length;
  return new Map([...found].map(([item, box]) => [item, inFile(box)]));
}

const isElement = (node: Root["children"][number] | undefined): node is Element => node?.type === "element";

/**
 * After sanitizing: puts where each task box starts in the file on the box, as `data-task-offset`. Only the
 * boxes of the document's own task items get one; raw HTML that looks like one starts somewhere else.
 */
export function markTaskBoxes(offsets: Map<number, number>) {
  const walk = (node: Root | Element) => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      const at = child.tagName === "li" ? offsets.get(child.position?.start.offset ?? -1) : undefined;
      if (at !== undefined) {
        // A loose list's item holds its box in its first paragraph.
        const first = child.children.find(isElement);
        const box = first?.tagName === "p" ? first.children.find(isElement) : first;
        if (box?.tagName === "input") box.properties.dataTaskOffset = at;
      }
      walk(child);
    }
  };
  return () => (tree: Root) => (offsets.size ? walk(tree) : undefined);
}

/** `text` with the task box at `offset` ticked, or unticked when it was; undefined when there is no box there. */
export function toggleTask(text: string, offset: number) {
  const box = text.slice(offset, offset + 3);
  if (!BOX.test(box)) return undefined;
  return text.slice(0, offset + 1) + (box === "[ ]" ? "x" : " ") + text.slice(offset + 2);
}

/** A task item's own text, without the lists nested in it. */
function itemText(box: HTMLElement) {
  const item = box.closest("li");
  const own = [...(item?.childNodes ?? [])].filter((n) => !(n instanceof Element && /^(UL|OL)$/.test(n.tagName)));
  return own.map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
}

/**
 * Lets the task boxes in `root` be ticked: they take clicks and the keyboard, named by their item's text.
 * Focuses the box at `focus`. Returns the undo, which makes them read-only again.
 */
export function enableTaskBoxes(root: HTMLElement, focus?: number) {
  const boxes = [...root.querySelectorAll<HTMLInputElement>("input[data-task-offset]")];
  for (const box of boxes) {
    box.disabled = false;
    box.setAttribute("aria-label", itemText(box));
    if (Number(box.dataset.taskOffset) === focus) box.focus({ preventScroll: true });
  }
  return () =>
    boxes.forEach((box) => {
      box.disabled = true;
      box.removeAttribute("aria-label");
    });
}
