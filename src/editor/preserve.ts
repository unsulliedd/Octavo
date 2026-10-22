// Saves rewrite only the top-level blocks that changed: every other block is copied from the file as
// it was written, so a one-paragraph edit is a one-paragraph diff.

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { parseMarkdown } from "../render";
import { diffLines } from "../lineDiff";
import { DEFAULT_STYLE, type MarkdownStyle } from "./markdown";

type Mdast = {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Mdast[];
  [key: string]: unknown;
};
/** A top-level block: its source range, and a key that is the same for blocks with the same content however they are written. */
type Block = {
  start: number;
  end: number;
  type: string;
  key: string;
  /** For a table: its rows (the header first) and its column alignment. */
  table?: { rows: { start: number; end: number; key: string }[]; align: string };
};

const parser = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm).use(remarkMath);

type Definitions = Map<string, { url: unknown; title: unknown }>;

/**
 * The block's content without source positions. Reference links and images count as the link or
 * image they resolve to, since the editor writes them inline.
 */
function contentKey(node: Mdast, definitions: Definitions) {
  const plain = (n: Mdast): unknown => {
    const { position: _, children, ...rest } = n;
    const ref = n.type === "linkReference" || n.type === "imageReference" ? definitions.get(String(n.identifier)) : undefined;
    if (ref) {
      const base = { type: n.type === "linkReference" ? "link" : "image", url: ref.url, title: ref.title ?? null };
      return n.type === "linkReference" ? { ...base, children: children?.map(plain) } : { ...base, alt: n.alt };
    }
    return children ? { ...rest, children: children.map(plain) } : rest;
  };
  // Sorted keys, so nodes built in a different order compare equal.
  return JSON.stringify(plain(node), (_, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1))) : v,
  );
}

function definitionsOf(nodes: Mdast[]): Definitions {
  const found: Definitions = new Map();
  for (const n of nodes) {
    if (n.type === "definition" && !found.has(String(n.identifier))) found.set(String(n.identifier), { url: n.url, title: n.title });
  }
  return found;
}

// Blocks by text without its final line breaks, for the last few texts. A save's result is added
// directly, so the next save doesn't parse the file text again.
const cache = new Map<string, Block[] | undefined>();
function remember(md: string, result: Block[] | undefined) {
  cache.set(md, result);
  if (cache.size > 4) cache.delete(cache.keys().next().value!);
}

/** The top-level blocks of `text`, or undefined if they can't be told apart reliably. */
export function blocks(text: string): Block[] | undefined {
  const md = text.replace(/\n+$/, "");
  if (!cache.has(md)) remember(md, parseBlocks(md));
  return cache.get(md);
}

/** `blocks` without the cache. */
export function parseBlocks(md: string): Block[] | undefined {
  // Keys come from the Markdown as the reader and editor see it, with stray `$` escaped; ranges from the text itself.
  const escaped = parseMarkdown(md);
  const keyed = (escaped.tree as Mdast).children ?? [];
  const raw = escaped.md === md ? keyed : ((parser.parse(md) as Mdast).children ?? []);
  if (raw.length !== keyed.length || raw.some((n, i) => n.type !== keyed[i].type)) return undefined;
  const definitions = definitionsOf(keyed);
  const range = (n: Mdast) => ({ start: n.position?.start.offset ?? 0, end: n.position?.end.offset ?? 0 });
  return raw.map((n, i) => {
    const block: Block = { ...range(n), type: n.type, key: contentKey(keyed[i], definitions) };
    const rows = n.children ?? [];
    const keyedRows = keyed[i].children ?? [];
    if (n.type === "table" && rows.length === keyedRows.length) {
      block.table = {
        rows: rows.map((row, r) => ({ ...range(row), key: contentKey(keyedRows[r], definitions) })),
        align: JSON.stringify(keyed[i].align ?? []),
      };
    }
    return block;
  });
}

/** The delimiter row of a table: the first non-empty line after its header row. */
function delimiterRow(md: string, table: NonNullable<Block["table"]>, end: number) {
  const after = md.slice(table.rows[0].end, table.rows[1]?.start ?? end);
  return after.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

/**
 * An edited table with every row whose cells didn't change copied from the original table, and the
 * original delimiter row if the columns and their alignment are the same.
 */
function mergeTable(original: string, a: Block, edited: string, b: Block) {
  const ta = a.table!;
  const tb = b.table!;
  const lines: string[] = [];
  let ia = 0;
  let ib = 0;
  for (const op of diffLines(
    ta.rows.map((r) => r.key),
    tb.rows.map((r) => r.key),
  )) {
    if (op.kind === "same") lines.push(original.slice(ta.rows[ia].start, ta.rows[ia].end)), ia++, ib++;
    else if (op.kind === "add") lines.push(edited.slice(tb.rows[ib].start, tb.rows[ib].end)), ib++;
    else ia++;
  }
  const sameColumns = ta.align === tb.align;
  const delimiter = sameColumns ? delimiterRow(original, ta, a.end) : delimiterRow(edited, tb, b.end);
  return [lines[0], delimiter, ...lines.slice(1)].join("\n");
}

/**
 * The edited Markdown with every top-level block whose content didn't change copied from `original`,
 * together with the text between neighboring copied blocks. Link reference definitions the editor drops
 * are kept. Both texts use LF line endings. Returns `edited` when the blocks can't be matched.
 */
export function preserveUnchanged(original: string, edited: string): string {
  const a = blocks(original);
  const b = blocks(edited);
  if (!a?.length || !b?.length) return edited;
  // Each piece of the result is an original block (ia), an edited block (ib), or both when unchanged.
  // A piece with `table` is an edited table merged with original table `table`.
  const pieces: { ia?: number; ib?: number; table?: number }[] = [];
  let ia = 0;
  let ib = 0;
  // A run of changes: removed original blocks (definitions among them are kept) and added edited blocks.
  // The added blocks take the place of the first removed block that isn't a definition.
  let removed: number[] = [];
  let added: number[] = [];
  const flush = () => {
    const at = removed.findIndex((i) => a[i].type !== "definition");
    const kept = removed.filter((i) => a[i].type === "definition").map((i) => ({ ia: i }));
    const before = at < 0 ? [] : kept.filter((p) => p.ia < removed[at]);
    const replaced = removed.filter((i) => a[i].type !== "definition");
    // One table edited in place: its unchanged rows are kept too.
    if (replaced.length === 1 && added.length === 1 && a[replaced[0]].table && b[added[0]].table) {
      pieces.push(...before, { ib: added[0], table: replaced[0] }, ...kept.slice(before.length));
      removed = [];
      added = [];
      return;
    }
    pieces.push(...before, ...added.map((i) => ({ ib: i })), ...kept.slice(before.length));
    removed = [];
    added = [];
  };
  for (const op of diffLines(
    a.map((x) => x.key),
    b.map((x) => x.key),
  )) {
    if (op.kind === "same") {
      flush();
      pieces.push({ ia: ia++, ib: ib++ });
    } else if (op.kind === "add") added.push(ib++);
    else removed.push(ia++);
  }
  flush();
  if (!pieces.length) return edited;
  const text = (p: (typeof pieces)[number]) => {
    if (p.ia !== undefined) return original.slice(a[p.ia].start, a[p.ia].end);
    if (p.table !== undefined) return mergeTable(original, a[p.table], edited, b[p.ib!]);
    return edited.slice(b[p.ib!].start, b[p.ib!].end);
  };
  let out = pieces[0].ia === 0 ? original.slice(0, a[0].start) : edited.slice(0, b[pieces[0].ib ?? 0].start);
  const result: Block[] = [];
  pieces.forEach((p, i) => {
    const prev = pieces[i - 1];
    if (prev) {
      if (prev.ia !== undefined && p.ia === prev.ia + 1) out += original.slice(a[prev.ia].end, a[p.ia].start);
      else if (prev.ib !== undefined && p.ib === prev.ib + 1) out += edited.slice(b[prev.ib].end, b[p.ib].start);
      else out += "\n\n";
    }
    const piece = text(p);
    const block = p.ia !== undefined ? a[p.ia] : b[p.ib!];
    const shift = out.length - block.start;
    const rows = block.table?.rows.map((r) => ({ ...r, start: r.start + shift, end: r.end + shift }));
    result.push({ ...block, start: out.length, end: out.length + piece.length, table: rows && { ...block.table!, rows } });
    out += piece;
  });
  if (pieces.every((p) => p.table === undefined)) remember(out, result);
  return out + "\n";
}

/** The bullet, emphasis, strong emphasis and rule characters `md` uses most; the defaults where it uses none. */
export function markdownStyle(md: string): MarkdownStyle {
  const counts = { bullet: new Map<string, number>(), emphasis: new Map<string, number>(), strong: new Map<string, number>(), rule: new Map<string, number>() };
  const count = (kind: keyof typeof counts, offset: number | undefined) => {
    const char = offset === undefined ? undefined : md[offset];
    if (char) counts[kind].set(char, (counts[kind].get(char) ?? 0) + 1);
  };
  const walk = (node: Mdast, parent?: Mdast) => {
    const start = node.position?.start.offset;
    if (node.type === "listItem" && parent && !parent.ordered) count("bullet", start);
    else if (node.type === "emphasis") count("emphasis", start);
    else if (node.type === "strong") count("strong", start);
    else if (node.type === "thematicBreak") count("rule", start);
    node.children?.forEach((child) => walk(child, node));
  };
  walk(parser.parse(md) as Mdast);
  const pick = <K extends keyof MarkdownStyle>(kind: K, allowed: string): MarkdownStyle[K] => {
    const best = [...counts[kind]].filter(([c]) => allowed.includes(c)).sort((x, y) => y[1] - x[1])[0];
    return (best?.[0] ?? DEFAULT_STYLE[kind]) as MarkdownStyle[K];
  };
  return { bullet: pick("bullet", "-*+"), emphasis: pick("emphasis", "_*"), strong: pick("strong", "_*"), rule: pick("rule", "-*_") };
}
