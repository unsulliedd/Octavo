// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { contentKey, createEditor } from "./session";

const open = (markdown: string) => createEditor(document.createElement("div"), markdown, { imageUrl: String, onChange: () => {} });

test("Markdown that opens as the same content is exact", async () => {
  const s = await open("# Title\n\n| a | b |\n|---|---|\n| `x` | **y** |\n\n- one\n- two\n\nPrice $5 and $x^2$.\n");
  const snap = s.snapshot();
  expect(snap.exact).toBe(true);
  expect(s.edited()).toBe(false);
  await s.destroy();
});

test("Markdown that would open differently is not exact", async () => {
  // A table row with more cells than its header gains an empty header cell when written back.
  const s = await open("| a | b |\n|---|---|\n| `x|y` | z |\n");
  expect(s.snapshot().exact).toBe(false);
  await s.destroy();
});

test("inline code containing an escaped | in a table cell stays exact and keeps its text", async () => {
  const root = document.createElement("div");
  const markdown = "| a | b |\n|---|---|\n| `x\\|y` | z |\n";
  const s = await createEditor(root, markdown, { imageUrl: String, onChange: () => {} });
  expect(root.querySelector("td code")?.textContent).toBe("x|y");
  const snap = s.snapshot();
  expect(snap.exact).toBe(true);
  expect(snap.markdown).toContain("x\\|y");
  await s.destroy();
});

test("typing | into inline code in a table cell saves as an exact escaped pipe", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const s = await createEditor(root, "| a | b |\n|---|---|\n| `xy` | z |\n", { imageUrl: String, onChange: () => {} });
  root.querySelector("td code")!.firstChild!.nodeValue = "x|y";
  await vi.waitFor(() => expect(s.edited()).toBe(true));
  const snap = s.snapshot("| a | b |\n|---|---|\n| `xy` | z |\n");
  expect(snap.exact).toBe(true);
  expect(snap.markdown).toContain("`x\\|y`");
  await s.destroy();
  root.remove();
});

test("markSaved makes the snapshot's content the saved state", async () => {
  const s = await open("Text\n");
  const snap = s.snapshot();
  s.markSaved(snap);
  expect(s.edited()).toBe(false);
  await s.destroy();
});

test("task items show a checkbox that ticks them; plain items have none", async () => {
  const root = document.createElement("div");
  const s = await createEditor(root, "- [ ] buy milk\n- [x] done\n\nText\n\n- plain\n", { imageUrl: String, onChange: () => {} });
  const boxes = root.querySelectorAll<HTMLInputElement>('li[data-item-type="task"] > input[type="checkbox"]');
  expect([...boxes].map((b) => b.checked)).toEqual([false, true]);
  boxes[0].click();
  expect(s.markdown()).toBe("- [x] buy milk\n- [x] done\n\nText\n\n- plain\n");
  expect(root.querySelectorAll("li > input").length).toBe(2);
  expect(root.querySelector<HTMLInputElement>('li[data-item-type="task"] > input')!.checked).toBe(true);
  await s.destroy();
});

test("empty list items and empty paragraphs aren't written as <br />", async () => {
  const s = await createEditor(document.createElement("div"), "- one\n-\n- three\n\n1. one\n2.\n", { imageUrl: String, onChange: () => {} });
  expect(s.markdown()).not.toContain("<br");
  await s.destroy();
});

test("an empty task item is safe to save: it opens again as an empty bullet", async () => {
  const s = await createEditor(document.createElement("div"), "- [ ] x\n", { imageUrl: String, onChange: () => {} });
  const schema = s.snapshot().doc.type.schema;
  const item = (checked: boolean | null, text?: string) =>
    schema.nodeFromJSON({
      type: "doc",
      content: [{ type: "bullet_list", content: [{ type: "list_item", attrs: { checked }, content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : undefined }] }] }],
    });
  expect(contentKey(item(false))).toBe(contentKey(item(null)));
  expect(contentKey(item(false, "x"))).not.toBe(contentKey(item(null, "x")));
  await s.destroy();
});

test("formatting keys go to onKey; the editor's own formatting keys are off", async () => {
  const root = document.createElement("div");
  const keys: string[] = [];
  const s = await createEditor(root, "Text\n", { imageUrl: String, onChange: () => {}, onKey: (e) => (keys.push(e.key), false) });
  const press = (key: string, mods: KeyboardEventInit) => root.querySelector(".ProseMirror")!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...mods }));
  press("1", { ctrlKey: true, altKey: true, code: "Digit1" });
  press("Enter", { shiftKey: true });
  expect(keys).toEqual(["1", "Enter"]);
  expect(s.markdown()).toBe("Text\n");
  await s.destroy();
});

test("frontmatter shows as properties that write back as YAML", async () => {
  const root = document.createElement("div");
  const s = await createEditor(root, "---\ntitle: Octavo\ntags: [a, b]\n---\n\nText\n", { imageUrl: String, onChange: () => {} });
  const inputs = () => [...root.querySelectorAll<HTMLInputElement>(".properties input")];
  expect(inputs().map((i) => i.value)).toEqual(["title", "Octavo", "tags", "[a, b]"]);
  const type = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    field.value = value;
    field.dispatchEvent(new Event("input"));
  };
  type(inputs()[1], "Octavo: a reader");
  expect(s.markdown()).toBe('---\ntitle: "Octavo: a reader"\ntags: [a, b]\n---\n\nText\n');
  root.querySelector<HTMLButtonElement>('[aria-label="Remove this property"]')!.click();
  expect(s.markdown()).toBe("---\ntags: [a, b]\n---\n\nText\n");
  expect(s.format().disabled).toContain("properties");
  root.querySelector<HTMLButtonElement>('[aria-label="Remove properties"]')!.click();
  expect(s.markdown()).toBe("Text\n");
  await s.destroy();
});

test("deeper YAML is edited as YAML, and properties can be added to a document", async () => {
  const root = document.createElement("div");
  const s = await createEditor(root, "---\nowners:\n  - design\n---\n\nText\n", { imageUrl: String, onChange: () => {} });
  const yaml = root.querySelector<HTMLTextAreaElement>(".properties textarea")!;
  expect(yaml.value).toBe("owners:\n  - design");
  await s.destroy();

  const plain = document.createElement("div");
  const t = await createEditor(plain, "Text\n", { imageUrl: String, onChange: () => {} });
  expect(t.format().disabled).not.toContain("properties");
  t.formatAction("properties");
  expect(t.snapshot()).toMatchObject({ markdown: "---\n---\n\nText\n", exact: true });
  const [key, value] = plain.querySelectorAll<HTMLInputElement>(".properties input");
  key.value = "title";
  key.dispatchEvent(new Event("input"));
  value.value = "New";
  value.dispatchEvent(new Event("input"));
  expect(t.markdown()).toBe("---\ntitle: New\n---\n\nText\n");
  await t.destroy();
});

test("Mermaid diagrams are drawn while editing and selected whole; other code blocks stay text", async () => {
  const root = document.createElement("div");
  const s = await createEditor(root, "```mermaid\nflowchart LR\n  A --> B\n```\n\n```js\nlet a = 1;\n```\n", { imageUrl: String, onChange: () => {} });
  expect(root.querySelectorAll(".mermaid-block")).toHaveLength(1);
  expect(root.querySelector("pre[data-language='js'] code")!.textContent).toBe("let a = 1;");
  expect(s.diagram()).toBeUndefined();
  root.querySelector(".mermaid-block")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  expect(s.diagram()).toEqual({ value: "flowchart LR\n  A --> B" });
  s.setDiagram("flowchart LR\n  A --> C");
  expect(s.markdown()).toBe("```mermaid\nflowchart LR\n  A --> C\n```\n\n```js\nlet a = 1;\n```\n");
  await s.destroy();
});
