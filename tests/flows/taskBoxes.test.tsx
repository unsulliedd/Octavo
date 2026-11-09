// @vitest-environment jsdom
// Task boxes ticked in the reading view: written at once, one character at a time, and only when nothing else writes the file.
import { emit } from "@tauri-apps/api/event";
import { act } from "react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { calls, click, FILE, launch, settle, setUpFlow, tearDownFlow, until, type Flow } from "../support/appFlow";

let flow: Flow;
const NOTE = "# Tasks\r\n\r\n- [ ] Buy milk\r\n  - [X] Call home\r\n\r\nEnd.\r\n";

beforeEach(() => {
  flow = setUpFlow({ [FILE]: NOTE });
});

afterEach(tearDownFlow);

const boxes = () => [...flow.host.querySelectorAll<HTMLInputElement>(".doc input[type=checkbox]")];
const writes = () => calls(flow, "save_doc");
const differingChars = (a: string, b: string) => [...a].filter((c, i) => c !== b[i]).length + Math.abs(a.length - b.length);

test("a click ticks a box and writes the file at once, one character changed; a second click undoes it", async () => {
  await launch(flow);
  const [milk, home] = boxes();
  expect(milk.disabled).toBe(false);
  expect(milk.getAttribute("aria-label")).toBe("Buy milk");
  expect(home.checked).toBe(true);

  await click(milk);
  await until(() => writes().length === 1, "the write");
  const ticked = NOTE.replace("- [ ] Buy", "- [x] Buy");
  expect(flow.disk.get(FILE)).toBe(ticked);
  expect(differingChars(NOTE, ticked)).toBe(1);
  expect(writes()[0].args).toMatchObject({ path: FILE, expected: NOTE, backup: true });
  // The file's new text is rendered: the boxes are new elements, ticked as it says.
  await until(() => boxes()[0] !== milk, "the new render");
  expect(boxes()[0].checked).toBe(true);
  expect(boxes()[0].disabled).toBe(false);

  const call = boxes()[1];
  await click(call);
  // A click before the new text is shown is ignored, so the next tick starts from the text written.
  await click(boxes()[0]);
  expect(boxes()[0].checked).toBe(true);
  await until(() => writes().length === 2, "the second write");
  expect(flow.disk.get(FILE)).toBe(ticked.replace("[X] Call", "[ ] Call"));
  await until(() => boxes()[1] !== call, "the new render");
  expect(boxes()[1].checked).toBe(false);

  await click(boxes()[0]);
  await until(() => writes().length === 3, "the third write");
  expect(flow.disk.get(FILE)).toBe(NOTE.replace("[X] Call", "[ ] Call"));
});

test("with the option off the boxes stay read-only and nothing is written", async () => {
  await launch(flow, { tickTasks: false });
  const [milk] = boxes();
  expect(milk.disabled).toBe(true);
  expect(milk.hasAttribute("aria-label")).toBe(false);
  await click(milk);
  await settle(50);
  expect(writes()).toEqual([]);
});

test("the boxes are read-only during an edit session, also in its reading view, and come back after Done", async () => {
  await launch(flow);
  await click(flow.host.querySelector(".edit-btn"));
  await until(() => flow.host.querySelector(".ProseMirror"), "the editor");
  await click([...flow.host.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Preview"));
  await until(() => boxes().length === 2, "the reading view of the edit session");
  expect(boxes()[0].disabled).toBe(true);
  await click(flow.host.querySelector(".done-btn"));
  await until(() => boxes().length === 2 && !boxes()[0].disabled, "the boxes enabled again");
  expect(writes()).toEqual([]);
});

test("a file changed on disk since it was read isn't written; it is read again and says so", async () => {
  await launch(flow);
  const changed = NOTE.replace("End.", "Changed elsewhere.");
  flow.disk.set(FILE, changed);
  const reads = calls(flow, "open_doc").length;
  await click(boxes()[0]);
  await until(() => flow.host.querySelector(".error.banner"), "the message");
  expect(flow.host.querySelector(".error.banner")?.textContent).toContain("changed on disk");
  expect(boxes()[0].checked).toBe(false);
  expect(flow.disk.get(FILE)).toBe(changed);
  await until(() => calls(flow, "open_doc").length > reads, "the file read again");
  await until(() => flow.host.querySelector(".doc")?.textContent?.includes("Changed elsewhere."), "the file as it is on disk");
  expect(boxes()[0].disabled).toBe(false);
});

test("a write from the reading view is read back by the watcher without a conflict", async () => {
  await launch(flow);
  await click(boxes()[0]);
  await until(() => writes().length === 1, "the write");
  await act(async () => void (await emit("doc-changed", FILE)));
  await settle(400);
  expect(flow.host.querySelector(".error.banner, .conflict")).toBeNull();
  expect(boxes()[0].checked).toBe(true);
});
