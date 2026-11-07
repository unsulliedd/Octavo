import type { Ctx } from "@milkdown/kit/ctx";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { commonmark, remarkPreserveEmptyLinePlugin } from "@milkdown/kit/preset/commonmark";
import { remarkGFMPlugin } from "@milkdown/kit/preset/gfm";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";

/**
 * A ProseMirror atom that keeps one mdast node's raw source (`value`) and writes it back untouched.
 * Math and frontmatter round-trip exactly because the editor never parses their contents.
 */
function rawNode(name: string, mdastType: string, inline: boolean) {
  return $nodeSchema(name, () => ({
    group: inline ? "inline" : "block",
    inline,
    atom: true,
    attrs: { value: { default: "" } },
    parseDOM: [
      {
        tag: `[data-type="${name}"]`,
        getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? "" }),
      },
    ],
    toDOM: (node) => [inline ? "span" : "pre", { "data-type": name, "data-value": node.attrs.value }, node.attrs.value],
    parseMarkdown: {
      match: (node) => node.type === mdastType,
      runner: (state, node, type) => {
        state.addNode(type, { value: String(node.value ?? "") });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === name,
      runner: (state, node) => {
        state.addNode(mdastType, undefined, node.attrs.value);
      },
    },
  }));
}

/**
 * Milkdown's commonmark preset without its empty-line plugin, which writes every empty paragraph (an empty
 * list item, or Enter pressed twice) as `<br />`. Markdown has no empty paragraphs, so they are left out.
 */
export const octavoCommonmark = commonmark.filter((plugin) => !remarkPreserveEmptyLinePlugin.includes(plugin));

export const mathInlineSchema = rawNode("math_inline", "inlineMath", true);
export const mathBlockSchema = rawNode("math_block", "math", false);
export const frontmatterSchema = rawNode("frontmatter", "yaml", false);

/** Milkdown plugins on top of commonmark + gfm. */
export const octavoMarkdown = [
  $remark("remarkMath", () => remarkMath),
  // Milkdown passes `{}` when no options are given, which remark-frontmatter rejects.
  $remark("remarkFrontmatter", () => remarkFrontmatter, "yaml"),
  mathInlineSchema,
  mathBlockSchema,
  frontmatterSchema,
].flat();

/** The characters the serializer writes bullets, emphasis, strong emphasis and rules with. */
export type MarkdownStyle = { bullet: "-" | "*" | "+"; emphasis: "_" | "*"; strong: "_" | "*"; rule: "-" | "*" | "_" };

export const DEFAULT_STYLE: MarkdownStyle = { bullet: "-", emphasis: "_", strong: "*", rule: "-" };

/** Serializer settings that keep hand-written Markdown closest to how it was written, in `style`. */
export function configureMarkdown(ctx: Ctx, style: MarkdownStyle = DEFAULT_STYLE) {
  ctx.update(remarkStringifyOptionsCtx, (o) => ({ ...o, ...style }));
  // Without this every table row is re-padded to its widest cell.
  ctx.set(remarkGFMPlugin.options.key, { tablePipeAlign: false });
}
