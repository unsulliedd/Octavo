// Find in document: the search the find bar's options make, matching block by block, the replacement text, and the
// reading view's DOM ranges. The find bar paints the reading view's ranges with the CSS Custom Highlight API, so the
// rendered document is never rewritten; the editor and the Source view paint their own matches.

export type FindOptions = { matchCase: boolean; wholeWord: boolean; regex: boolean };
export const NO_OPTIONS: FindOptions = { matchCase: false, wholeWord: false, regex: false };

/** At most this many matches are found and painted; the count then reads "1000+". */
export const MATCH_LIMIT = 1000;

/**
 * A search: its pattern, and whether it runs on folded text (plain text that ignores case).
 * Limitation: a regular expression that backtracks badly, such as `(a+)+$` on a long run of "a", can still take
 * very long inside one block; the per-block search and the match limit bound the rest of the document, not that.
 */
export type Query = { pattern: RegExp; folded: boolean };

/** A match in a list of blocks: the block's index, and the match with its index in the block's text. */
export type Hit = { block: number; match: RegExpExecArray };

/** A match a view found: where it starts in the view's content, in document order, and the match. */
export type Found = { from: number; match: RegExpExecArray };

/** What the find bar searches: the reading view, the editor or the Source view. */
export type FindTarget<F extends Found = Found> = {
  find(query: Query, limit: number): F[];
  /** Where a match is in the window, to start at the first one in view. */
  top(found: F): number;
  /** Paints `found` with the one at `current` (or none, -1) as the current match; with `reveal`, scrolls to that one. */
  show(found: F[], current: number, reveal: boolean): void;
  clear(): void;
  /** Replaces each match with its text in one undo step; returns where the last one's text ends. None when read-only. */
  replace?(found: F[], texts: string[]): number;
  /** Calls `onChange` after each change to the content; returns a function that stops. */
  watch?(onChange: () => void): () => void;
};

/**
 * Lower case with the same length as `s`, so offsets in the result are offsets in `s`.
 * Characters whose lower case is longer keep its first unit: "İ" becomes "i".
 */
export function fold(s: string) {
  const lower = s.toLowerCase();
  if (lower.length === s.length) return lower;
  let out = "";
  for (const ch of s) {
    const l = ch.toLowerCase();
    out += l.length === ch.length ? l : ch.length === 1 ? l[0] : ch;
  }
  return out;
}

const WORD = "[\\p{L}\\p{M}\\p{N}_]";

/**
 * The search for `query` with `options`, `{ error }` for a regular expression JavaScript rejects, or undefined when
 * there is nothing to find. As plain text, any run of whitespace in the query matches any run of whitespace.
 */
export function compileQuery(query: string, options: FindOptions): Query | { error: string } | undefined {
  const folded = !options.regex && !options.matchCase;
  let source = query;
  if (!options.regex) {
    const words = (folded ? fold(query) : query).trim().split(/\s+/).filter(Boolean);
    source = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
  }
  if (!source) return undefined;
  if (options.wholeWord) source = `(?<!${WORD})(?:${source})(?!${WORD})`;
  try {
    return { pattern: new RegExp(source, options.regex && !options.matchCase ? "giu" : "gu"), folded };
  } catch (e) {
    // "Invalid regular expression: /(/gu: Unterminated group" comes down to "Unterminated group".
    return { error: String((e as Error).message).split(": ").pop() || "Invalid pattern" };
  }
}

/** The matches of `query` in `text`, at most `limit`. Empty matches (`^`, `\b`, `x*`) are stepped over and don't count. */
export function matchText(text: string, { pattern, folded }: Query, limit = Infinity): RegExpExecArray[] {
  const hay = folded ? fold(text) : text;
  const found: RegExpExecArray[] = [];
  pattern.lastIndex = 0;
  while (found.length < limit) {
    const m = pattern.exec(hay);
    if (!m) break;
    if (m[0]) found.push(m);
    else pattern.lastIndex = m.index + ((hay.codePointAt(m.index) ?? 0) > 0xffff ? 2 : 1);
  }
  return found;
}

/** The matches of `query` in each of `blocks`, in order, at most `limit`; no match runs from one block into the next. */
export function findInBlocks(blocks: readonly string[], query: Query, limit = Infinity): Hit[] {
  const hits: Hit[] = [];
  for (let block = 0; block < blocks.length && hits.length < limit; block++) {
    for (const match of matchText(blocks[block], query, limit - hits.length)) hits.push({ block, match });
  }
  return hits;
}

/**
 * The text that replaces `match`: `template` as typed, or for a regular expression with `$1`…`$99`, `$<name>`,
 * `$&` and `$$` filled in as `String.prototype.replace` fills them in.
 */
export function replacement(template: string, match: RegExpExecArray, regex: boolean) {
  if (!regex) return template;
  const groups = match.length - 1;
  return template.replace(/\$(?:(\$)|(&)|(\d\d?)|<([^>]*)>)/g, (all, dollar, whole, digits: string | undefined, name: string | undefined) => {
    if (dollar) return "$";
    if (whole) return match[0];
    if (digits) {
      const two = Number(digits);
      if (digits.length === 2 && two >= 1 && two <= groups) return match[two] ?? "";
      const one = Number(digits[0]);
      return one >= 1 && one <= groups ? (match[one] ?? "") + digits.slice(1) : all;
    }
    return match.groups && name !== undefined ? (match.groups[name] ?? "") : all;
  });
}

/** Index after stepping `step` from `current` through `count` matches, wrapping around at both ends. */
export function stepIndex(current: number, step: number, count: number) {
  return count ? (((current + step) % count) + count) % count : -1;
}

/** The first match at or below `top` (for example the top of the visible area), or the first match. */
export function firstVisible(matchTops: number[], top: number) {
  const i = matchTops.findIndex((t) => t >= top);
  return matchTops.length ? Math.max(i, 0) : -1;
}

/** "2 of 7", "2 of 1000+" when there are more than were counted, or "No results". */
export function matchLabel(index: number, count: number, more = false) {
  return count ? `${index + 1} of ${count}${more ? "+" : ""}` : "No results";
}

/** Scrolls `scroller` so the box from `top` to `bottom` (in the window) is in view, a third of the way down. */
export function bringIntoView({ top, bottom }: { top: number; bottom: number }, scroller: Element) {
  const box = scroller.getBoundingClientRect();
  if (top < box.top + 8 || bottom > box.bottom - 8) scroller.scrollBy({ top: top - box.top - box.height / 3 });
}

/** A match in a list of text pieces: piece index and offset of its start and (exclusive) end. */
export type Match = { start: [piece: number, offset: number]; end: [piece: number, offset: number]; match: RegExpExecArray };

/**
 * Finds `query` in `pieces`, the document's text nodes in order. A match may span pieces (text split by inline
 * formatting) but not a piece whose index is in `breaks` (the first text of a new block).
 */
export function findMatches(pieces: string[], query: Query, breaks: ReadonlySet<number> = new Set(), limit = Infinity): Match[] {
  const blocks: { first: number; starts: number[]; text: string }[] = [];
  pieces.forEach((piece, i) => {
    if (i === 0 || breaks.has(i)) blocks.push({ first: i, starts: [], text: "" });
    const block = blocks[blocks.length - 1];
    block.starts.push(block.text.length);
    block.text += piece;
  });
  return findInBlocks(
    blocks.map((b) => b.text),
    query,
    limit,
  ).map(({ block, match }): Match => {
    const { first, starts } = blocks[block];
    // The piece holding character `c`: the last one starting at or before it (empty pieces share a start with the next).
    const pieceAt = (c: number) => {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= c) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    const end = match.index + match[0].length;
    const a = pieceAt(match.index);
    const b = pieceAt(end - 1);
    return { start: [first + a, match.index - starts[a]], end: [first + b, end - starts[b]], match };
  });
}

/** Elements whose text is never searched: hidden MathML copies of formulas, code block headers, diagrams. */
const SKIP = ".katex-mathml, .code-head, svg, style, script";
const BLOCK = "p, li, td, th, h1, h2, h3, h4, h5, h6, pre, blockquote, dt, dd, figcaption, caption, summary, div";

/** The searchable text nodes under `root`, in document order, and the indexes that start a new block. */
export function textPieces(root: Element) {
  const nodes: Text[] = [];
  const breaks = new Set<number>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let lastBlock: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = node.parentElement?.closest(BLOCK) ?? null;
    if (block !== lastBlock) breaks.add(nodes.length);
    lastBlock = block;
    nodes.push(node as Text);
  }
  return { nodes, breaks };
}

/** The matches of `query` under `root` as DOM ranges, numbered in document order. */
export function findRanges(root: Element, query: Query, limit = Infinity) {
  const { nodes, breaks } = textPieces(root);
  return findMatches(
    nodes.map((n) => n.data),
    query,
    breaks,
    limit,
  ).map(({ start, end, match }, from) => {
    const range = root.ownerDocument.createRange();
    range.setStart(nodes[start[0]], start[1]);
    range.setEnd(nodes[end[0]], end[1]);
    return { range, from, match };
  });
}
