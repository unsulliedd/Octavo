// @vitest-environment jsdom
// Unusual documents and large-view links through the whole App. A fake disk stands behind the mocked IPC, and
// every document is generated here. What the disk can refuse to read is tested in src-tauri/src/lib.rs.
import { EditorView } from "@codemirror/view";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FILE = "C:\\docs\\note.md";
const BOM = "\uFEFF";

let host: HTMLElement;
let root: Root;
let disk: Map<string, string>;
let writes: string[];
let opened: string[];
let scrolled: Element[];
/** The file passed on the command line. */
let initial: string;
/** What open_doc says for a file it can't read. */
let unreadable: string | undefined;

const settle = (ms = 0) => act(() => new Promise<void>((done) => setTimeout(done, ms)));
async function until(check: () => unknown, what: string) {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await settle(20);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("prefs", JSON.stringify({ autosave: false }));
  disk = new Map();
  writes = [];
  initial = FILE;
  opened = [];
  scrolled = [];
  unreadable = undefined;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 0);
  const noRects = () => Object.assign([], { item: () => null });
  Element.prototype.getClientRects = noRects as never;
  Range.prototype.getClientRects = noRects as never;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = function () {
    scrolled.push(this);
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      const a = (args ?? {}) as Record<string, any>;
      switch (cmd) {
        case "plugin:app|version":
          return "0.0.0";
        case "initial_file":
          return initial;
        case "open_doc": {
          if (unreadable) throw unreadable;
          const text = disk.get(a.path);
          if (text === undefined) throw "No such file";
          return { path: a.path, text };
        }
        case "save_doc":
          if (a.expected != null && disk.get(a.path) !== a.expected) throw "The file changed on disk.";
          disk.set(a.path, a.text);
          writes.push(a.text);
          return true;
        case "plugin:opener|open_url":
          opened.push(a.url);
          return null;
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  (window as any).__TAURI_INTERNALS__.convertFileSrc = (path: string) => `asset://${path}`;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined as never;
  document.body.innerHTML = "";
  clearMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function start() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<App />));
}

/** Starts the app with `text` as the file `file`, open in the reading view. */
async function launch(text: string, file = FILE) {
  disk.set(file, text);
  initial = file;
  await start();
  await until(() => host.querySelector(".doc-column article"), "the document to open");
}

const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());
const namedButton = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === name)!;

async function startEditing() {
  await click(host.querySelector(".edit-btn"));
  await until(() => host.querySelector(".ProseMirror p, .ProseMirror h1, .ProseMirror .properties"), "the editor");
}

/** Replaces `over` in the editor's paragraph that holds it; ProseMirror reads the change from the DOM. */
async function typeOver(over: string, text: string) {
  const p = [...host.querySelectorAll(".ProseMirror p")].find((el) => el.textContent?.includes(over))!;
  await act(async () => {
    p.firstChild!.nodeValue = p.firstChild!.nodeValue!.replace(over, text);
  });
  await until(() => host.querySelector<HTMLElement>(".save-state")?.dataset.state === "unsaved", "the edit to register");
}

async function finish() {
  await click(host.querySelector(".done-btn"));
  const state = () => host.querySelector<HTMLElement>(".save-state")?.dataset.state;
  await until(() => host.querySelector(".edit-btn") && state() !== "saving" && state() !== "unsaved", "editing to end");
}

async function openSource() {
  await click(namedButton("Source"));
  await until(() => host.querySelector(".cm-content"), "Source mode");
}

function typeSource(from: string, to: string) {
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  const at = view.state.doc.toString().indexOf(from);
  return act(async () => view.dispatch({ changes: { from: at, to: at + from.length, insert: to } }));
}

// One word of one paragraph changes; everything else in the file must come back byte for byte.
const FILES: Record<string, string> = {
  "no final line break": "# T\n\nOriginal text.",
  "several final line breaks": "# T\n\nOriginal text.\n\n\n",
  "a byte order mark": `${BOM}# T\n\nOriginal text.\n`,
  "a byte order mark before frontmatter": `${BOM}---\ntitle: x\n---\n\nOriginal text.\n`,
  "frontmatter with CRLF": "---\r\ntitle: x\r\n---\r\n\r\nOriginal text.\r\n",
  CRLF: "# T\r\n\r\n- a\r\n- b\r\n\r\nOriginal text.\r\n",
  "a byte order mark and CRLF": `${BOM}# T\r\n\r\nOriginal text.\r\n`,
  "lone carriage returns": "# T\r\rOriginal text.\r\rlast\r",
  "mixed line endings": "# T\r\n\r\nfirst\nsecond\r\n\nOriginal text.\n\nmore\r\nlines\n",
  "mostly CRLF, no final line break": "a\r\n\r\nb\r\n\r\nOriginal text.\n\nc",
};

for (const [name, text] of Object.entries(FILES)) {
  const expected = text.replace("Original", "Changed");

  test(`the editor changes only the edit in a file with ${name}`, async () => {
    await launch(text);
    await startEditing();
    await typeOver("Original", "Changed");
    await finish();
    expect(writes).toEqual([expected]);
  });

  test(`Source mode changes only the edit in a file with ${name}`, async () => {
    await launch(text);
    await click(host.querySelector(".edit-btn"));
    await until(() => host.querySelector(".ProseMirror"), "the editor");
    await openSource();
    await typeSource("Original", "Changed");
    await finish();
    expect(writes).toEqual([expected]);
  });

  test(`opening and closing the editor writes nothing to a file with ${name}`, async () => {
    await launch(text);
    await startEditing();
    await finish();
    expect(writes).toEqual([]);
    expect(disk.get(FILE)).toBe(text);
  });
}

test("an empty file opens, edits and saves", async () => {
  await launch("");
  expect(host.querySelector("article")!.textContent).toBe("");
  await click(host.querySelector(".edit-btn"));
  await until(() => host.querySelector(".ProseMirror"), "the editor");
  await openSource();
  await typeSource("", "New text\n");
  await finish();
  expect(writes).toEqual(["New text"]);
});

test("a file with only frontmatter shows its properties, and the editor leaves it alone", async () => {
  const text = "---\ntitle: Only this\n---\n";
  await launch(text);
  expect(host.querySelector(".doc-properties")!.textContent).toContain("Only this");
  await startEditing();
  await finish();
  expect(writes).toEqual([]);
});

test("a file holding only line breaks stays as it is", async () => {
  await launch("\n\n\n");
  await startEditing();
  await finish();
  expect(writes).toEqual([]);
});

test("a file that can't be read says why on the home screen", async () => {
  unreadable = "C:\\docs\\wide.md can't be opened: Octavo opens UTF-8 text files, and this file isn't one.";
  disk.set(FILE, "");
  await start();
  await until(() => host.querySelector(".error"), "the message");
  expect(host.querySelector(".error")!.textContent).toBe(unreadable);
  expect(host.querySelector("article")).toBeNull();
});

test("a document nested too deeply says so instead of opening", async () => {
  disk.set(FILE, `${">".repeat(20000)} deep\n`);
  await start();
  await until(() => host.querySelector(".error"), "the message");
  expect(host.querySelector(".error")!.textContent).toContain("nested too deeply");
});

test("deep lists and quotes that the pipeline can handle open, and save only the edit", async () => {
  const quotes = `${"> ".repeat(60)}deep\n\n`;
  const list = Array.from({ length: 40 }, (_, i) => `${"  ".repeat(i)}- item ${i}`).join("\n");
  const text = `${quotes}${list}\n\nOriginal text.\n`;
  await launch(text);
  expect(host.querySelectorAll("blockquote")).toHaveLength(60);
  await startEditing();
  await typeOver("Original", "Changed");
  await finish();
  expect(writes).toEqual([text.replace("Original", "Changed")]);
});

test("one very long line opens and saves only the edit", async () => {
  const text = `${"word ".repeat(20000)}\n\nOriginal text.\n`;
  await launch(text);
  await startEditing();
  await typeOver("Original", "Changed");
  await finish();
  expect(writes).toEqual([text.replace("Original", "Changed")]);
}, 60_000);

test("a large table keeps every row it doesn't change", async () => {
  const rows = Array.from({ length: 500 }, (_, i) => `|${i}|  b  | c |`).join("\n");
  const text = `| a | b | c |\n|:--|---|--:|\n${rows}\n\nOriginal text.\n`;
  await launch(text);
  expect(host.querySelectorAll("tbody tr")).toHaveLength(500);
  await startEditing();
  await typeOver("Original", "Changed");
  await finish();
  expect(writes).toEqual([text.replace("Original", "Changed")]);
}, 60_000);

test("thousands of headings fill the outline, with unique ids", async () => {
  const text = `${"## Same\n\n".repeat(2000)}Original text.\n`;
  disk.set(FILE, text);
  localStorage.setItem("prefs", JSON.stringify({ autosave: false, outline: true }));
  await start();
  await until(() => host.querySelectorAll(".outline a").length === 2000, "the outline");
  const ids = [...host.querySelectorAll("article h2")].map((h) => h.id);
  expect(new Set(ids).size).toBe(2000);
}, 60_000);

const INLINE_IMAGE = `data:image/png;base64,${"iVBORw0KGgo".repeat(50000)}`;

// The sanitizer drops data: sources, so the reading view shows nothing for an inline image while the editor shows it.
test.fails("a large inline image shows in the reading view", async () => {
  await launch(`![pic](${INLINE_IMAGE})
`);
  expect(host.querySelector("img")!.getAttribute("src")).toBe(INLINE_IMAGE);
});

test("a large inline image's data is written back untouched", async () => {
  const text = `![pic](${INLINE_IMAGE})

Original text.
`;
  await launch(text);
  await startEditing();
  await typeOver("Original", "Changed");
  await finish();
  expect(writes).toEqual([text.replace("Original", "Changed")]);
}, 60_000);

test("a file name with spaces and non-ASCII letters opens, saves, and its images and links work", async () => {
  const file = "C:\\Belgeler ğ\\notlar ü 日本語.md";
  const other = "C:\\Belgeler ğ\\diğer not.md";
  const text = "![p](resim%20%C4%9F.png)\n\n[next](di%C4%9Fer%20not.md)\n\nOriginal text.\n";
  disk.set(other, "# Other\n");
  disk.delete(FILE);
  await launch(text, file);
  disk.delete(file);
  disk.set(file, text);
  await until(() => host.querySelector("article img"), "the document");
  expect(decodeURIComponent(host.querySelector("img")!.getAttribute("src")!)).toContain("C:\\Belgeler ğ\\resim ğ.png");
  await startEditing();
  await typeOver("Original", "Changed");
  await finish();
  expect(disk.get(file)).toBe(text.replace("Original", "Changed"));
  await click(host.querySelector('article a[href*="not.md"]'));
  await until(() => host.querySelector("article h1")?.textContent === "Other", "the linked document");
});

// Links in the large view open the way they do in the reading view.

const TABLE = "# Doc\n\n| Where |\n|---|\n| [site](https://example.com/) |\n| [other](other.md) |\n| [below](#later) |\n\n## Later\n";

async function openTableLarge() {
  await launch(TABLE);
  await until(() => host.querySelector(".table-scroll .large-open"), "the open button");
  await click(host.querySelector(".table-scroll .large-open"));
  await until(() => document.querySelector('[role="dialog"]'), "the large view");
}
const largeLink = (name: string) => [...document.querySelectorAll('[role="dialog"] a')].find((a) => a.textContent === name)!;

test("an empty link in the document stays on the page", async () => {
  await launch("[nowhere]()\n");
  await until(() => host.querySelector("article a"), "the link");
  const press = new MouseEvent("click", { bubbles: true, cancelable: true });
  await act(async () => void host.querySelector("article a")!.dispatchEvent(press));
  expect(press.defaultPrevented).toBe(true);
  expect(opened).toEqual([]);
});

test("a web link in a large table goes to the browser and the view stays open", async () => {
  await openTableLarge();
  await click(largeLink("site"));
  expect(opened).toEqual(["https://example.com/"]);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});

test("a document link in a large table opens that document and closes the view", async () => {
  disk.set("C:\\docs\\other.md", "# Other\n");
  await openTableLarge();
  await click(largeLink("other"));
  await until(() => host.querySelector("article h1")?.textContent === "Other", "the linked document");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test("a fragment link in a large table closes the view and scrolls the document there", async () => {
  await openTableLarge();
  await click(largeLink("below"));
  await until(() => !document.querySelector('[role="dialog"]'), "the view to close");
  expect(scrolled.map((el) => el.id)).toContain("later");
});
