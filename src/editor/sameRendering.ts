// Compares two rendered documents the way the page shows them, ignoring differences that never reach the screen.

const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DETAILS|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|OL|P|PRE|SECTION|SUMMARY|TABLE|TBODY|TD|TFOOT|TH|THEAD|TR|UL)$/;
const isBlock = (node: Node | null) => node instanceof Element && BLOCK.test(node.tagName);

const MARKS = "del, em, strong";

/** The mark that holds everything inside `mark`, if there is one. */
const onlyMark = (mark: Element) => (mark.childNodes.length === 1 && mark.firstElementChild?.matches(MARKS) ? mark.firstElementChild : null);

/** Puts marks around the same content in one order: `<del><strong>x</strong></del>` shows as `<strong><del>x</del></strong>`. */
function sortMarks(root: DocumentFragment) {
  for (const outer of root.querySelectorAll(MARKS)) {
    const chain = [outer];
    for (let next = onlyMark(outer); next; next = onlyMark(next)) chain.push(next);
    const names = chain.map((mark) => mark.tagName);
    const sorted = [...names].sort();
    if (names.join() === sorted.join()) continue;
    const marks = sorted.map((name) => document.createElement(name));
    marks.slice(1).forEach((mark, i) => marks[i].append(mark));
    marks[marks.length - 1].append(...chain[chain.length - 1].childNodes);
    outer.replaceWith(marks[0]);
  }
}

/**
 * Reader HTML as the webview's DOM holds it: attributes serialized alike, marks around the same content in one order,
 * and no whitespace-only text next to blocks or inside table structure, which is never rendered. Whitespace between
 * inline elements and in code stays.
 */
export function domHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const ignored: Node[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.trim() || node.parentElement?.closest("pre")) continue;
    const inTable = /^(TABLE|THEAD|TBODY|TFOOT|TR)$/.test(node.parentElement?.tagName ?? "");
    const betweenBlocks = node.parentNode === template.content || isBlock(node.previousSibling) || isBlock(node.nextSibling);
    if (inTable || betweenBlocks) ignored.push(node);
  }
  ignored.forEach((node) => node.parentNode?.removeChild(node));
  // Where a task box is in the file moves with any edit before it, and is never shown.
  template.content.querySelectorAll("[data-task-offset]").forEach((box) => box.removeAttribute("data-task-offset"));
  sortMarks(template.content);
  return template.innerHTML;
}

/** True when two rendered documents show the same thing. */
export const sameRendering = (a: string, b: string) => a === b || domHtml(a) === domHtml(b);
