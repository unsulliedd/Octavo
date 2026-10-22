import { unified, type PluggableList } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import type { Element, Root } from "hast";
import { resolveLocal, safeDecode } from "./paths";
import { languageName } from "./languages";
import { displayValue, parseProperties } from "./properties";

/** rehype-sanitize prefixes ids and names from the document with this to prevent DOM clobbering. */
const ID_PREFIX = "user-content-";

// GitHub's schema, plus the classes remark-math puts on math code nodes.
const schema = {
  ...defaultSchema,
  clobberPrefix: ID_PREFIX,
  attributes: {
    ...defaultSchema.attributes,
    code: [["className", /^language-./, "math-inline", "math-display"]],
  },
};

export { dirname, joinPath, resolveLocal, safeDecode } from "./paths";

type Mdast = { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: Mdast[] };
const parser = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm).use(remarkMath);

/**
 * Offsets of `$` that open inline math but break Pandoc's rule: the content can't start or end with
 * whitespace, and the closing `$` can't be followed by a digit. Returns only the first bad opener per
 * paragraph, heading or table cell, since escaping it changes how the rest of that block pairs up.
 */
function strayDollars(md: string, root: Mdast) {
  const firstBad = new Map<Mdast, number>();
  const walk = (node: Mdast, block: Mdast) => {
    if (/^(paragraph|heading|tableCell)$/.test(node.type)) block = node;
    const s = node.position?.start.offset;
    const e = node.position?.end.offset;
    if (node.type === "inlineMath" && s !== undefined && e !== undefined && md[s + 1] !== "$") {
      const bad = /^\s|\s$/.test(md.slice(s + 1, e - 1)) || /\d/.test(md[e] ?? "");
      if (bad && !firstBad.has(block)) firstBad.set(block, s);
    }
    node.children?.forEach((child) => walk(child, block));
  };
  walk(root, root);
  return [...firstBad.values()];
}

/**
 * Parses Markdown, escaping `$` that only look like inline math so "$0.89 / ... $2.97" stays text.
 * Each pass escapes the first bad opener per block and re-parses, so its old closer can open a later valid
 * span ("$5 for $x^2$" keeps `x^2` as math). A document without bad spans is parsed once.
 * A paragraph chaining 50+ bad spans keeps the rest.
 */
export function parseMarkdown(md: string) {
  let tree = parser.parse(md);
  if (!md.includes("$")) return { md, tree };
  // Limitation: one full parse per pass, which adds up for a long document full of prices; re-parse
  // only the affected blocks if that shows up in profiles.
  for (let pass = 0; pass < 50; pass++) {
    const bad = strayDollars(md, tree as Mdast);
    if (!bad.length) break;
    for (const s of bad.sort((a, b) => b - a)) md = `${md.slice(0, s)}\\${md.slice(s)}`;
    tree = parser.parse(md);
  }
  return { md, tree };
}

/** The Markdown with stray `$` escaped, see parseMarkdown. The editor must run this on load too. */
export const escapeStrayDollars = (md: string) => (md.includes("$") ? parseMarkdown(md).md : md);


/** Wraps each code block (except Mermaid, which App replaces) in a header with its language and a Copy button. */
function codeBlocks() {
  const walk = (node: Root | Element) => {
    node.children.forEach((child, i) => {
      if (child.type !== "element") return;
      const code = child.tagName === "pre" ? child.children.find((c): c is Element => c.type === "element") : undefined;
      if (!code) return walk(child);
      const classes = (code.properties.className as string[] | undefined) ?? [];
      const lang = classes.find((c) => c.startsWith("language-"))?.slice("language-".length);
      if (lang === "mermaid") return;
      const label = lang ? languageName(lang) : "";
      node.children[i] = {
        type: "element",
        tagName: "div",
        properties: { className: ["code-block"] },
        children: [
          {
            type: "element",
            tagName: "div",
            properties: { className: ["code-head"] },
            children: [
              { type: "element", tagName: "span", properties: { className: ["code-lang"] }, children: [{ type: "text", value: label }] },
              {
                type: "element",
                tagName: "button",
                properties: { className: ["code-copy"], type: "button", ariaLabel: "Copy code" },
                children: [{ type: "text", value: "Copy" }],
              },
            ],
          },
          child,
        ],
      };
    });
  };
  return walk;
}

/**
 * Points in-document links at the ids that exist after sanitizing: `#fn-1` becomes `#user-content-fn-1`
 * when only the prefixed id is in the document. Links whose target exists as written stay unchanged.
 */
function fragmentLinks() {
  return (tree: Root) => {
    const ids = new Set<string>();
    const links: Element[] = [];
    const walk = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (typeof child.properties.id === "string") ids.add(child.properties.id);
        if (child.tagName === "a" && typeof child.properties.href === "string" && child.properties.href.startsWith("#")) links.push(child);
        walk(child);
      }
    };
    walk(tree);
    for (const el of links) {
      const href = el.properties.href as string;
      const id = safeDecode(href.slice(1));
      if (!ids.has(id) && ids.has(ID_PREFIX + id)) el.properties.href = `#${ID_PREFIX}${href.slice(1)}`;
    }
  };
}

/** Cells up to this many characters never wrap; longer ones wrap but keep a minimum width (styles.css). */
const SHORT_CELL = 20;

const textOf = (node: Element | Root): string =>
  node.children.map((c) => (c.type === "text" ? c.value : c.type === "element" ? textOf(c) : "")).join("");

/**
 * Marks table cells as short or long, so a wide table keeps readable columns and scrolls sideways
 * instead of squeezing every column to one word per line. Each table goes in a `table-scroll` box,
 * which scrolls it sideways while the table itself keeps its own layout.
 */
function tableCells() {
  const scrollBox = (node: Root | Element) =>
    node.type === "element" && ((node.properties.className as string[] | undefined) ?? []).includes("table-scroll");
  const walk = (node: Root | Element) => {
    node.children.forEach((child, i) => {
      if (child.type === "element" && child.tagName === "table" && !scrollBox(node)) {
        node.children[i] = { type: "element", tagName: "div", properties: { className: ["table-scroll"] }, children: [child] };
      }
    });
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "td" || child.tagName === "th") {
        const className = (child.properties.className as string[] | undefined) ?? [];
        const length = textOf(child).trim().length;
        child.properties.className = [...className, length <= SHORT_CELL ? "cell-short" : "cell-long"];
      }
      walk(child);
    }
  };
  return walk;
}

/** Inline code and link text longer than this gets break points at separators. */
const BREAKABLE = 16;

/**
 * Adds break opportunities (<wbr>) in long inline code and in links that show their URL: after `/ \ _ :` and
 * before `. ? & = #`. Paths, qualified names and URLs then wrap at a separator instead of in the middle of a
 * word. Copied text is unchanged.
 */
function breakPoints() {
  const split = (node: Element) => {
    node.children = node.children.flatMap((child) => {
      if (child.type !== "text" || child.value.length <= BREAKABLE) return [child];
      return child.value
        .split(/(?<=[/\\_:])(?=[^/\\._:?&=#])|(?<=[^/\\._:?&=#])(?=[.?&=#])/)
        .flatMap((part, i): Element["children"] =>
          i ? [{ type: "element", tagName: "wbr", properties: {}, children: [] }, { type: "text", value: part }] : [{ type: "text", value: part }],
        );
    });
  };
  const walk = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element" || child.tagName === "pre") continue;
      const classes = (child.properties.className as string[] | undefined) ?? [];
      const code = child.tagName === "code" && !classes.includes("math-inline");
      const url = child.tagName === "a" && /^(https?:\/\/|www\.)/.test(textOf(child));
      if (code || url) split(child);
      else walk(child);
    }
  };
  return walk;
}

const el = (tagName: string, className: string | undefined, children: Element["children"]): Element => ({
  type: "element",
  tagName,
  properties: className ? { className: [className] } : {},
  children,
});

/**
 * The frontmatter above the document: a list of names and values, lists as chips. YAML that goes deeper than
 * names and values shows as it is. Built from text only, so it needs no sanitizing.
 */
function properties(yaml: string | undefined) {
  return () => (tree: Root) => {
    if (!yaml?.trim()) return;
    const rows = parseProperties(yaml);
    const text = (value: string) => ({ type: "text" as const, value });
    const block = rows
      ? el(
          "dl",
          "doc-properties",
          rows.flatMap(({ key, value }) => {
            const shown = displayValue(value);
            return [el("dt", undefined, [text(key)]), el("dd", undefined, Array.isArray(shown) ? shown.map((v) => el("span", "property-chip", [text(v)])) : [text(shown)])];
          }),
        )
      : el("pre", "doc-properties-yaml", [el("code", undefined, [text(yaml)])]);
    block.properties.ariaLabel = "Properties";
    tree.children.unshift(block);
  };
}

function localImages(dir: string, toUrl: (path: string) => string) {
  const walk = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      const src = child.properties.src;
      if (child.tagName === "img" && typeof src === "string") {
        child.properties.dataSrc = src; // as written in the document, for the missing-image placeholder
        child.properties.src = resolveLocal(dir, src, toUrl);
      }
      walk(child);
    }
  };
  return () => walk;
}

/**
 * Markdown → sanitized HTML. Raw HTML in the document is allowed, then sanitized.
 * `toUrl` is called with the full path of every local image the document shows.
 */
export async function render(md: string, dir: string, toUrl: (path: string) => string) {
  const { md: source, tree } = parseMarkdown(md);
  // Slug after sanitize so heading ids stay "my-heading" and match GitHub-style #my-heading links.
  const rehype: PluggableList = [[rehypeSanitize, schema], rehypeSlug, fragmentLinks, tableCells, breakPoints];
  // Raw HTML needs a "<", so documents without one skip rehype-raw.
  if (source.includes("<")) rehype.unshift(rehypeRaw);
  // Limitation: "$" sniff decides whether to load KaTeX; a false positive only costs one lazy chunk
  if (source.includes("$")) {
    const katex = await import("rehype-katex");
    rehype.push(katex.default); // after sanitize: KaTeX output is trusted, document HTML is not
  }
  // Highlighting loads only for documents with a fenced code block that names a language.
  if (/^ {0,3}(`{3,}|~{3,})[ \t]*[^\s`~]/m.test(source)) {
    const { default: rehypeHighlight } = await import("rehype-highlight");
    rehype.push([rehypeHighlight, { plainText: ["mermaid"] }]);
  }
  const front = (tree as Mdast).children?.[0] as (Mdast & { value?: string }) | undefined;
  rehype.push(codeBlocks, localImages(dir, toUrl), properties(front?.type === "yaml" ? front.value : undefined));

  const processor = unified()
    // Footnote ids get their prefix from rehype-sanitize only, so they aren't prefixed twice.
    .use(remarkRehype, { allowDangerousHtml: true, clobberPrefix: "" })
    .use(rehype)
    .use(rehypeStringify);
  return processor.stringify(await processor.run(tree));
}
