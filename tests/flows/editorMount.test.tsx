// @vitest-environment jsdom
// The editor's lifetime through the whole App: switching views keeps the edits and opens one editor per Edit,
// a theme change keeps the editor, and files dropped on the window open or go into the document.
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FILE, launch, OTHER, press, setUpFlow, tabNames, tearDownFlow, until, type Flow } from "../support/appFlow";

const editors = vi.hoisted(() => ({ created: 0 }));
vi.mock("@/editor/session", async (original) => {
  const real = await original<typeof import("@/editor/session")>();
  return {
    ...real,
    createEditor: async (...args: Parameters<typeof real.createEditor>) => {
      editors.created++;
      return real.createEditor(...args);
    },
  };
});

// The window's drag-and-drop handler, called directly by the tests.
const drop = vi.hoisted(() => ({ handler: undefined as undefined | ((e: { payload: { type: string; paths?: string[] } }) => void) }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (handler: typeof drop.handler) => {
      drop.handler = handler;
      return Promise.resolve(() => {});
    },
  }),
}));

let flow: Flow;

beforeEach(() => {
  editors.created = 0;
  drop.handler = undefined;
  flow = setUpFlow({ [FILE]: "# Title\n\nOriginal text.\n", [OTHER]: "# Other\n\nMore.\n" });
});

afterEach(tearDownFlow);

const q = (selector: string) => flow.host.querySelector<HTMLElement>(selector);

async function startEditing() {
  await press("e", { ctrlKey: true });
  await until(() => q(".ProseMirror p"), "the editor's text");
  await until(() => !q("article.doc"), "the editor to replace the reading view");
}

/** Types into the editor: the paragraph's text node changes and ProseMirror reads the mutation. */
async function type(text: string) {
  await act(async () => void (q(".ProseMirror p")!.firstChild!.nodeValue = text));
  await until(() => q(".save-state")?.dataset.state === "unsaved", "the edit to register");
}

test("Edit, Preview and Edit again keep the edits and open one editor per Edit", async () => {
  await launch(flow, { autosave: false });
  await startEditing();
  await type("Changed text.");
  expect(editors.created).toBe(1);
  await press("P", { ctrlKey: true, shiftKey: true });
  await until(() => q("article.doc")?.textContent?.includes("Changed text."), "the preview of the edits");
  await press("P", { ctrlKey: true, shiftKey: true });
  await until(() => q(".ProseMirror p")?.textContent === "Changed text.", "the editor with the edits");
  expect(editors.created).toBe(2);
});

test("a theme change while editing keeps the editor", async () => {
  await launch(flow);
  await startEditing();
  const editor = q(".ProseMirror");
  flow.systemDark.matches = true;
  await act(async () => flow.systemDark.listeners.forEach((fn) => fn()));
  await until(() => q(".app")?.dataset.theme === "dark", "the dark theme");
  expect(editors.created).toBe(1);
  expect(q(".ProseMirror")).toBe(editor);
});

test("a Markdown file dropped on the window opens", async () => {
  await launch(flow);
  await act(async () => drop.handler!({ payload: { type: "enter" } }));
  expect(q(".drop-overlay")?.textContent).toBe("Drop to open");
  await act(async () => drop.handler!({ payload: { type: "drop", paths: [OTHER] } }));
  await until(() => tabNames(flow).length === 2, "the dropped file");
  expect(q(".drop-overlay")).toBeNull();
});

test("an image dropped on a document being edited goes into it", async () => {
  await launch(flow);
  await startEditing();
  await act(async () => drop.handler!({ payload: { type: "over" } }));
  expect(q(".drop-overlay")?.textContent).toBe("Drop an image to insert it, or a document to open it");
  await act(async () => drop.handler!({ payload: { type: "drop", paths: ["C:\\docs\\pic.png"] } }));
  const image = () => q(".ProseMirror img:not(.ProseMirror-separator)");
  await until(image, "the image");
  expect(image()?.getAttribute("alt")).toBe("pic");
  expect(tabNames(flow)).toEqual(["note.md"]);
});
