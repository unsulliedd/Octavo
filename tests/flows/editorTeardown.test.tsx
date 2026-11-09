// @vitest-environment jsdom
// Leaving Edit for the Source view: the editor's DOM is no longer the reading view's, and nothing touches it afterwards.
import { afterEach, beforeEach, expect, test } from "vitest";
import { FILE, launch, press, setUpFlow, tearDownFlow, until, type Flow } from "../support/appFlow";

let flow: Flow;

beforeEach(() => {
  flow = setUpFlow({ [FILE]: "# Title\n\n```js\nconst x = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n" });
});

afterEach(tearDownFlow);

test("leaving Edit for Source leaves the closed editor's tables alone and raises no error", async () => {
  const errors: unknown[] = [];
  const onError = (e: ErrorEvent) => (e.preventDefault(), errors.push(e.error));
  window.addEventListener("error", onError);
  try {
    await launch(flow);
    await press("e", { ctrlKey: true });
    await until(() => flow.host.querySelector(".ProseMirror table") && flow.host.querySelector(".outline a[href^=\"#editor-heading\"]"), "the editor");
    const editorTable = flow.host.querySelector(".ProseMirror table")!;
    await press("M", { ctrlKey: true, shiftKey: true });
    await until(() => flow.host.querySelector(".cm-editor") && !flow.host.querySelector(".ProseMirror"), "the source view");
    // Gives the closing editor the time to react to anything that changed its DOM.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(editorTable.querySelector(".col-resize")).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    window.removeEventListener("error", onError);
  }
});
