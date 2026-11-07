// How Source mode reads Markdown: GitHub Flavored Markdown with frontmatter, and the headings for the outline.

import { markdownLanguage } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import type { MarkdownConfig, MarkdownParser } from "@lezer/markdown";

type Tree = ReturnType<MarkdownParser["parse"]>;

/** Frontmatter: `---` on the first line up to the next `---` line (or the end), so its last line isn't read as a heading. */
export const Frontmatter: MarkdownConfig = {
  defineNodes: [{ name: "Frontmatter", block: true, style: tags.meta }],
  parseBlock: [
    {
      name: "Frontmatter",
      before: "HorizontalRule",
      parse(cx, line) {
        if (cx.lineStart !== 0 || line.text.trimEnd() !== "---") return false;
        while (cx.nextLine()) {
          if (line.text.trimEnd() === "---") {
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt("Frontmatter", 0, cx.prevLineEnd()));
        return true;
      },
    },
  ],
};

export type SourceHeading = { level: number; text: string; from: number };

// Markup left out of a heading's text in the outline.
const MARKS = new Set(["HeaderMark", "EmphasisMark", "CodeMark", "LinkMark", "URL", "LinkTitle", "LinkLabel", "StrikethroughMark"]);

/** The headings in `text`, parsed as `tree`, with their text as the outline shows it and where each starts. */
export function headingsOf(tree: Tree, text: string): SourceHeading[] {
  const found: SourceHeading[] = [];
  tree.iterate({
    enter(node) {
      const level = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name)?.[1];
      if (!level) return;
      let out = "";
      let pos = node.from;
      tree.iterate({
        from: node.from,
        to: node.to,
        enter(inner) {
          if (!MARKS.has(inner.name) || inner.from < pos) return;
          out += text.slice(pos, inner.from);
          pos = inner.to;
          return false;
        },
      });
      out += text.slice(pos, node.to);
      found.push({ level: Number(level), text: out.replace(/\s+/g, " ").trim(), from: node.from });
      return false;
    },
  });
  return found;
}

/** The parser Source mode uses, for the tests. */
export const sourceParser = (markdownLanguage.parser as MarkdownParser).configure([Frontmatter]);
