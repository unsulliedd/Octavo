// @vitest-environment jsdom
import { expect, test } from "vitest";
import { defaultValueCtx, Editor, editorViewCtx, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { gfm } from "@milkdown/kit/preset/gfm";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { getMarkdown } from "@milkdown/kit/utils";
import {
  codeBlockAt,
  formatState,
  imageAt,
  insertImage,
  mathAt,
  mermaidAt,
  mermaidToCode,
  runFormat,
  selectDiagram,
  setCodeLanguage,
  setImage,
  setLink,
  setMath,
  setMermaid,
  toggleTask,
} from "./format";
import type { FormatAction } from "./formatInfo";
import { configureMarkdown, octavoCommonmark, octavoMarkdown } from "./markdown";

/** An editor on `md` with `word` selected, or the cursor at its start when `select` is false. */
async function at(md: string, word: string, select = true) {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.createElement("div"));
      ctx.set(defaultValueCtx, md);
      configureMarkdown(ctx);
    })
    .use(octavoCommonmark)
    .use(gfm)
    .use(octavoMarkdown)
    .use(history)
    .create();
  const view = editor.ctx.get(editorViewCtx);
  let pos = -1;
  view.state.doc.descendants((node, p) => {
    if (pos < 0 && node.isText && node.text!.includes(word)) pos = p + node.text!.indexOf(word);
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos, select ? pos + word.length : pos)));
  return {
    run: (action: FormatAction) => runFormat(editor.ctx, view, action),
    link: (href: string | null) => setLink(view, href),
    image: (src: string, alt: string) => insertImage(editor.ctx, src, alt),
    selectImage: () => {
      let at = -1;
      view.state.doc.descendants((node, p) => void (at < 0 && node.type.name === "image" && (at = p)));
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
    },
    selectedImage: () => imageAt(view.state),
    selectDiagram: () => {
      const tr = selectDiagram(view.state);
      if (tr) view.dispatch(tr);
      return !!tr;
    },
    selectBlock: (text: string) => {
      let at = -1;
      view.state.doc.descendants((node, p) => void (at < 0 && node.type.name === "code_block" && node.textContent.includes(text) && (at = p)));
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
    },
    diagram: () => mermaidAt(view.state),
    setDiagram: (value: string) => setMermaid(view, value),
    toCode: () => mermaidToCode(view),
    setImage: (alt: string, title: string) => setImage(view, alt, title),
    type: (text: string) => view.dispatch(view.state.tr.insertText(text)),
    codeLanguage: () => codeBlockAt(view.state)?.language,
    setLanguage: (language: string) => setCodeLanguage(view, language),
    math: () => mathAt(view.state),
    setMath: (value: string) => setMath(view, value),
    toggleTask: () => toggleTask(view, view.state.selection.$from.before(view.state.selection.$from.depth - 1)),
    state: () => formatState(view.state),
    markdown: () => editor.action(getMarkdown()),
    destroy: () => editor.destroy(),
  };
}

test.each<[FormatAction, string]>([
  ["bold", "Some **word** here.\n"],
  ["italic", "Some _word_ here.\n"],
  ["strike", "Some ~~word~~ here.\n"],
  ["code", "Some `word` here.\n"],
])("%s marks the selection and turns off again", async (action, md) => {
  const e = await at("Some word here.\n", "word");
  e.run(action);
  expect(e.markdown()).toBe(md);
  expect(e.state().active).toContain(action);
  e.run(action);
  expect(e.markdown()).toBe("Some word here.\n");
  await e.destroy();
});

test("headings, and the same heading again back to a paragraph", async () => {
  const e = await at("Title\n", "Title", false);
  e.run("h2");
  expect(e.markdown()).toBe("## Title\n");
  expect(e.state().active).toContain("h2");
  e.run("h1");
  expect(e.markdown()).toBe("# Title\n");
  e.run("h1");
  expect(e.markdown()).toBe("Title\n");
  await e.destroy();
});

test("headings 4 to 6 have only shortcuts, and Normal text makes any heading a paragraph", async () => {
  const e = await at("Title\n", "Title", false);
  e.run("h5");
  expect(e.markdown()).toBe("##### Title\n");
  expect(e.state().active).toContain("h5");
  e.run("paragraph");
  expect(e.markdown()).toBe("Title\n");
  e.run("h4");
  e.run("h4");
  expect(e.markdown()).toBe("Title\n");
  await e.destroy();
});

test("lists switch kind, become tasks and turn off", async () => {
  const e = await at("Item\n", "Item", false);
  e.run("bulletList");
  expect(e.markdown()).toBe("- Item\n");
  e.run("orderedList");
  expect(e.markdown()).toBe("1. Item\n");
  expect(e.state().active).toContain("orderedList");
  e.run("taskList");
  expect(e.markdown()).toBe("- [ ] Item\n");
  expect(e.state().active).toEqual(["taskList"]);
  e.run("taskList");
  expect(e.markdown()).toBe("Item\n");
  e.run("taskList");
  expect(e.markdown()).toBe("- [ ] Item\n");
  await e.destroy();
});

test("quote and code block toggle", async () => {
  const e = await at("Text\n", "Text", false);
  e.run("quote");
  expect(e.markdown()).toBe("> Text\n");
  e.run("quote");
  expect(e.markdown()).toBe("Text\n");
  e.run("codeBlock");
  expect(e.markdown()).toBe("```\nText\n```\n");
  expect(e.state().active).toContain("codeBlock");
  e.run("codeBlock");
  expect(e.markdown()).toBe("Text\n");
  await e.destroy();
});

test("links are set on the selection, inserted at the cursor and removed whole", async () => {
  const e = await at("See the site now.\n", "the site");
  e.link("https://example.com");
  expect(e.markdown()).toBe("See [the site](https://example.com) now.\n");
  expect(e.state().active).toContain("link");
  await e.destroy();
  const inside = await at("See [the site](https://example.com) now.\n", "site", false);
  inside.link(null);
  expect(inside.markdown()).toBe("See the site now.\n");
  await inside.destroy();
  const change = await at("See [the site](https://example.com) now.\n", "site", false);
  expect(change.state().href).toBe("https://example.com");
  change.link("https://example.org");
  expect(change.markdown()).toBe("See [the site](https://example.org) now.\n");
  await change.destroy();
  const empty = await at("See now.\n", "now", false);
  empty.link("https://example.com");
  expect(empty.markdown()).toBe("See <https://example.com>now.\n");
  await empty.destroy();
});

test("insert table, undo and redo", async () => {
  const e = await at("Text\n", "Text", false);
  expect(e.state().disabled).toEqual(["undo", "redo"]);
  e.run("table");
  expect(e.markdown()).toContain("| - | - | - |");
  expect(e.state().disabled).toContain("table");
  e.run("undo");
  expect(e.markdown()).toBe("Text\n");
  e.run("redo");
  expect(e.markdown()).toContain("| - | - | - |");
  await e.destroy();
});

test("horizontal rule and line break", async () => {
  const e = await at("First line\n\nSecond paragraph.\n", "line", false);
  e.run("lineBreak");
  expect(e.markdown()).toBe("First \\\nline\n\nSecond paragraph.\n");
  const r = await at("First line\n\nSecond paragraph.\n", "Second", false);
  r.run("rule");
  expect(r.markdown()).toContain("First line\n\n---\n");
  await e.destroy();
  await r.destroy();
});

test("a rule can't go in a table, and neither can go in a code block", async () => {
  const t = await at("| a | b |\n| - | - |\n| cell | x |\n", "cell", false);
  expect(t.state().disabled).toContain("rule");
  expect(t.state().disabled).not.toContain("lineBreak");
  const c = await at("```\ncode here\n```\n", "code", false);
  expect(c.state().disabled).toEqual(expect.arrayContaining(["rule", "lineBreak"]));
  await t.destroy();
  await c.destroy();
});

test("footnotes take the next free number and put the cursor in the note", async () => {
  const e = await at("Some word here.\n\nMore[^1].\n\n[^1]: First note.\n", "here", false);
  e.run("footnote");
  e.type("Second note.");
  expect(e.markdown()).toBe("Some word [^2]here.\n\nMore[^1].\n\n[^1]: First note.\n\n[^2]: Second note.\n");
  await e.destroy();
});

test("images are inserted at the cursor", async () => {
  const e = await at("Some word here.\n", "here", false);
  e.image("img/chart.png", "chart");
  expect(e.markdown()).toBe("Some word ![chart](img/chart.png)here.\n");
  await e.destroy();
});

test("a Mermaid diagram is selected whole, edited, removed when emptied, or turned into code", async () => {
  const e = await at("Text\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nAfter\n", "A --> B", false);
  expect(e.selectDiagram()).toBe(true);
  expect(e.diagram()).toMatchObject({ value: "flowchart LR\n  A --> B" });
  e.setDiagram("flowchart LR\n  A --> C");
  expect(e.markdown()).toBe("Text\n\n```mermaid\nflowchart LR\n  A --> C\n```\n\nAfter\n");
  expect(e.diagram()).toBeUndefined();
  e.selectBlock("A --> C");
  e.toCode();
  expect(e.markdown()).toBe("Text\n\n```\nflowchart LR\n  A --> C\n```\n\nAfter\n");
  expect(e.codeLanguage()).toBe("");
  await e.destroy();

  const f = await at("Text\n\n```mermaid\ngraph TD\n```\n\nAfter\n", "graph", false);
  f.selectDiagram();
  f.setDiagram("  ");
  expect(f.markdown()).toBe("Text\n\nAfter\n");
  await f.destroy();

  // A last diagram, or one before another diagram, gets a paragraph after it for the cursor.
  const g = await at("```mermaid\ngraph TD\n```\n\n```mermaid\ngraph LR\n```\n", "graph TD", false);
  g.selectDiagram();
  g.setDiagram("graph TD");
  expect(g.diagram()).toBeUndefined();
  g.selectBlock("graph LR");
  g.setDiagram("graph LR");
  expect(g.diagram()).toBeUndefined();
  expect(g.selectDiagram()).toBe(false);
  await g.destroy();
});

test("the selected image's alt text and title are read and set", async () => {
  const e = await at('Before ![old](img/a.png "Old title") after.\n', "Before", false);
  expect(e.selectedImage()).toBeUndefined();
  e.selectImage();
  expect(e.selectedImage()).toMatchObject({ src: "img/a.png", alt: "old", title: "Old title" });
  e.setImage("New alt", "");
  expect(e.markdown()).toBe("Before ![New alt](img/a.png) after.\n");
  expect(e.selectedImage()).toBeUndefined();
  e.selectImage();
  e.setImage("New alt", 'Say "hi"');
  expect(e.markdown()).toBe('Before ![New alt](img/a.png "Say \\"hi\\"") after.\n');
  await e.destroy();
});

test.each<FormatAction>(["footnote", "rule", "lineBreak"])("%s goes after selected text instead of replacing it", async (action) => {
  const e = await at("Some word here.\n", "word");
  e.run(action);
  expect(e.markdown()).toContain("word");
  await e.destroy();
});

test("an inserted image keeps selected text, and a path with spaces stays one link", async () => {
  const e = await at("Some word here.\n", "word");
  e.image("my images/a b.png", "a b");
  expect(e.markdown()).toContain("Some word");
  expect(e.markdown()).toMatch(/!\[a b\]\(<my images\/a b\.png>\)|!\[a b\]\(my%20images\/a%20b\.png\)/);
  await e.destroy();
});

test("one undo removes a footnote's reference and its note", async () => {
  const e = await at("Some word here.\n", "here", false);
  e.run("footnote");
  e.run("undo");
  expect(e.markdown()).toBe("Some word here.\n");
  await e.destroy();
});

test("the code block's language is read and set, and empty makes it plain text", async () => {
  const e = await at("```js\nconst a = 1;\n```\n", "const", false);
  expect(e.codeLanguage()).toBe("js");
  e.setLanguage("typescript");
  expect(e.markdown()).toBe("```typescript\nconst a = 1;\n```\n");
  e.setLanguage("mermaid");
  expect(e.markdown()).toBe("```mermaid\nconst a = 1;\n```\n");
  e.setLanguage("");
  expect(e.markdown()).toBe("```\nconst a = 1;\n```\n");
  await e.destroy();
  const p = await at("Not code.\n", "Not", false);
  expect(p.codeLanguage()).toBeUndefined();
  await p.destroy();
});

test("inline math is inserted at the cursor, selected, edited and removed when emptied", async () => {
  const e = await at("Area is here.\n", "here", false);
  e.run("mathInline");
  expect(e.math()).toEqual(expect.objectContaining({ value: "", block: false }));
  e.setMath("\pi r^2");
  expect(e.markdown()).toBe("Area is $\pi r^2$here.\n");
  expect(e.math()).toBeUndefined();
  await e.destroy();
  const r = await at("Area is here.\n", "here", false);
  r.run("mathInline");
  r.setMath("   ");
  expect(r.markdown()).toBe("Area is here.\n");
  await r.destroy();
});

test("a math block replaces an empty paragraph or goes after the current block", async () => {
  const e = await at("First paragraph.\n\nSecond.\n", "First", false);
  e.run("mathBlock");
  expect(e.math()).toEqual(expect.objectContaining({ block: true }));
  e.setMath("x = 1");
  expect(e.markdown()).toBe("First paragraph.\n\n$$\nx = 1\n$$\n\nSecond.\n");
  await e.destroy();
});

test("a task item is ticked and unticked, and a plain item isn't a task", async () => {
  const e = await at("- [ ] buy milk\n- [x] done already\n", "buy", false);
  e.toggleTask();
  expect(e.markdown()).toBe("- [x] buy milk\n- [x] done already\n");
  e.toggleTask();
  expect(e.markdown()).toBe("- [ ] buy milk\n- [x] done already\n");
  await e.destroy();
  const p = await at("- plain item\n", "plain", false);
  expect(p.toggleTask()).toBe(false);
  await p.destroy();
});
