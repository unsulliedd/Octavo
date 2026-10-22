// @vitest-environment jsdom
// Open → save through Milkdown, with no edits and with one paragraph edited. Reads fidelity/fixtures/ (committed) and
// fidelity/private/ (gitignored, your own files), writes results to fidelity/out/<set>/.
// A report, not a pass/fail gate.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { defaultValueCtx, Editor, editorViewCtx, parserCtx, rootCtx } from "@milkdown/kit/core";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import { configureMarkdown, octavoCommonmark, octavoMarkdown } from "../src/editor/markdown";
import { sameRendering } from "../src/editor/sameRendering";
import { markdownStyle, preserveUnchanged } from "../src/editor/preserve";
import { contentKey } from "../src/editor/session";
import { escapeStrayDollars, render } from "../src/render";

const sets = ["fixtures", "private"];
const out = join(import.meta.dirname, "out");

/**
 * `src` through the editor: its own Markdown (`result`), what a save writes without edits (`saved`),
 * after appending to the first paragraph (`edited`) and to the first table body cell (`cellEdited`), and
 * whether each opens as the editor's content.
 */
async function roundTrip(src: string) {
  const md = escapeStrayDollars(src); // as the editor loads it
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.createElement("div"));
      ctx.set(defaultValueCtx, md);
      configureMarkdown(ctx, markdownStyle(src));
    })
    .use(octavoCommonmark)
    .use(gfm)
    .use(octavoMarkdown)
    .create();
  const view = editor.ctx.get(editorViewCtx);
  // The check the editor makes before saving: the written Markdown opens as the same content.
  const opens = (text: string) => contentKey(editor.ctx.get(parserCtx)(escapeStrayDollars(text))) === contentKey(view.state.doc);
  const result = editor.action(getMarkdown());
  const saved = preserveUnchanged(src, result);
  const reopens = opens(result) && opens(saved);
  let paragraphEnd = -1;
  view.state.doc.forEach((node, offset) => {
    if (paragraphEnd < 0 && node.type.name === "paragraph") paragraphEnd = offset + node.nodeSize - 1;
  });
  // Each edit is saved over the original file, as autosave would after it.
  const saveAfter = (pos: number) => {
    if (pos < 0) return undefined;
    view.dispatch(view.state.tr.insertText(" (edited)", pos));
    const text = preserveUnchanged(src, editor.action(getMarkdown()));
    return opens(text) ? text : undefined;
  };
  const edited = saveAfter(paragraphEnd);
  let cellEnd = -1;
  view.state.doc.descendants((node, pos) => {
    if (cellEnd < 0 && node.type.name === "table_cell") cellEnd = pos + node.nodeSize - 2;
    return cellEnd < 0;
  });
  const cellEdited = saveAfter(cellEnd);
  await editor.destroy();
  return { result, saved, edited, cellEdited, reopens };
}

/** Source lines that no longer appear verbatim in the output. */
function lostLines(src: string, result: string) {
  const left = new Map<string, number>();
  for (const line of result.split("\n")) left.set(line, (left.get(line) ?? 0) + 1);
  let lost = 0;
  for (const line of src.split("\n")) {
    const n = left.get(line) ?? 0;
    if (n) left.set(line, n - 1);
    else lost++;
  }
  return lost;
}

test("round-trip report", async () => {
  const rows = [];
  for (const set of sets) {
    const dir = join(import.meta.dirname, set);
    if (!existsSync(dir)) continue;
    mkdirSync(join(out, set), { recursive: true });
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      // Limitation: EOL is compared as LF; the save layer restores the file's own EOL
      const src = readFileSync(join(dir, name), "utf8").replace(/\r\n/g, "\n");
      const { result, saved, edited, cellEdited, reopens } = await roundTrip(src);
      writeFileSync(join(out, set, name), result);
      const lines = src.split("\n").length;
      // Same reader output means nothing visible was lost; the remaining diffs are Markdown style.
      const sameHtml = sameRendering(await render(src, "", String), await render(result, "", String));
      rows.push({
        file: `${set}/${name}`,
        identical: result === src,
        sameHtml,
        reopens,
        lines,
        changed: lostLines(src, result),
        // Lines a save changes without edits, after editing one paragraph, and after also editing one
        // table cell (should be 0, that paragraph's lines, and one more).
        saveNoEdit: lostLines(src, saved),
        saveOneEdit: edited === undefined ? "-" : lostLines(src, edited),
        saveCellEdit: cellEdited === undefined ? "-" : lostLines(src, cellEdited),
      });
    }
  }
  console.table(rows);
}, 300_000);
