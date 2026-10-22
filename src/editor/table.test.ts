// @vitest-environment jsdom
import { expect, test } from "vitest";
import { defaultValueCtx, Editor, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { gfm } from "@milkdown/kit/preset/gfm";
import { TextSelection } from "@milkdown/kit/prose/state";
import { getMarkdown } from "@milkdown/kit/utils";
import { configureMarkdown, octavoCommonmark } from "./markdown";
import { runTableAction, tableAt } from "./table";
import { canRun, type TableAction } from "./tableInfo";

const TABLE = "Intro.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";

/** A table editor with the cursor in the cell holding `text`. */
async function inCell(text: string) {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.createElement("div"));
      ctx.set(defaultValueCtx, TABLE);
      configureMarkdown(ctx);
    })
    .use(octavoCommonmark)
    .use(gfm)
    .create();
  const view = editor.ctx.get(editorViewCtx);
  let at = -1;
  view.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text === text) at = pos;
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
  return {
    info: () => tableAt(view.state),
    run: (action: TableAction) => runTableAction(editor.ctx, action, view.state, view.dispatch),
    markdown: () => editor.action(getMarkdown()),
    type: (text: string) => view.dispatch(view.state.tr.insertText(text)),
    destroy: () => editor.destroy(),
  };
}

test.each<[TableAction, string]>([
  ["rowAbove", "| a | b |\n| - | - |\n| | |\n| 1 | 2 |\n| 3 | 4 |"],
  ["rowBelow", "| a | b |\n| - | - |\n| 1 | 2 |\n| | |\n| 3 | 4 |"],
  ["columnLeft", "| | a | b |\n| - | - | - |\n| | 1 | 2 |\n| | 3 | 4 |"],
  ["columnRight", "| a | | b |\n| - | - | - |\n| 1 | | 2 |\n| 3 | | 4 |"],
  ["deleteRow", "| a | b |\n| - | - |\n| 3 | 4 |"],
  ["deleteColumn", "| b |\n| - |\n| 2 |\n| 4 |"],
])("%s from the cell holding 1", async (action, table) => {
  const t = await inCell("1");
  expect(t.info()).toEqual({ headerRow: false, rows: 3, columns: 2, align: "left" });
  expect(t.run(action)).toBe(true);
  expect(t.markdown()).toBe(`Intro.\n\n${table}\n`);
  await t.destroy();
});

test("typing after inserting a row or column fills the new cell", async () => {
  const t = await inCell("1");
  t.run("rowBelow");
  t.type("x");
  t.run("columnRight");
  t.type("y");
  expect(t.markdown()).toBe("Intro.\n\n| a | | b |\n| - | - | - |\n| 1 | | 2 |\n| x | y | |\n| 3 | | 4 |\n");
  await t.destroy();
});

test("alignment applies to the column, and left is written without a colon", async () => {
  const t = await inCell("2");
  t.run("alignRight");
  expect(t.markdown()).toContain("| - | -: |");
  expect(t.info()?.align).toBe("right");
  t.run("alignCenter");
  expect(t.markdown()).toContain("| - | :-: |");
  t.run("alignLeft");
  expect(t.markdown()).toContain("| - | - |");
  await t.destroy();
});

test("the header row stays first, a table keeps a column, and nothing runs outside a table", async () => {
  const t = await inCell("a");
  expect(t.info()?.headerRow).toBe(true);
  expect(t.run("rowAbove")).toBe(false);
  expect(t.run("deleteRow")).toBe(false);
  expect(canRun("deleteColumn", { headerRow: false, rows: 3, columns: 1, align: "left" })).toBe(false);
  expect(canRun("deleteRow", { headerRow: false, rows: 2, columns: 2, align: "left" })).toBe(false);
  const outside = await inCell("Intro.");
  expect(outside.info()).toBeUndefined();
  expect(outside.run("rowBelow")).toBe(false);
  t.run("deleteTable");
  expect(t.markdown()).toBe("Intro.\n");
  await Promise.all([t.destroy(), outside.destroy()]);
});
