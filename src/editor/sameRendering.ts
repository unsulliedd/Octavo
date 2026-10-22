// Compares two rendered documents the way the page shows them, ignoring differences that never reach the screen.

const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DETAILS|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|OL|P|PRE|SECTION|SUMMARY|TABLE|TBODY|TD|TFOOT|TH|THEAD|TR|UL)$/;
const isBlock = (node: Node | null) => node instanceof Element && BLOCK.test(node.tagName);

/**
 * Reader HTML as the webview's DOM holds it: attributes serialized alike, and no whitespace-only text next to
 * blocks or inside table structure, which is never rendered. Whitespace between inline elements and in code stays.
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
  return template.innerHTML;
}

/** True when two rendered documents show the same thing. */
export const sameRendering = (a: string, b: string) => a === b || domHtml(a) === domHtml(b);
