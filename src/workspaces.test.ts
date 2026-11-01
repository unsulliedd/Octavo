import { expect, test } from "vitest";
import { samePath } from "./tabs";
import {
  PINNED,
  type Workspace,
  addItem,
  deleteWorkspace,
  fileTree,
  filterDocuments,
  removeItem,
  restorePath,
  visibleDocuments,
  withPinned,
  workspaceForFolder,
} from "./workspaces";

const workspace = (items: Workspace["items"], removed: string[] = []): Workspace => ({ id: "w", name: "w", items, removed });
const folder = (path: string) => ({ kind: "folder" as const, path });
const document = (path: string) => ({ kind: "document" as const, path });
const paths = (w: Workspace, scans: Record<string, string[]>) => visibleDocuments(w, scans).map((d) => d.path);

test("opening a folder makes one workspace named after it", () => {
  const { workspaces, workspace: made } = workspaceForFolder([PINNED], "C:\\Docs\\Notes");
  expect(made).toMatchObject({ name: "Notes", items: [folder("C:\\Docs\\Notes")], removed: [] });
  expect(workspaces).toEqual([PINNED, made]);
});

test("a name comes from the last folder, however the path ends", () => {
  const name = (path: string) => workspaceForFolder([], path).workspace.name;
  expect(name("C:\\Docs\\Notes\\")).toBe("Notes");
  expect(name("C:/Docs/Notes")).toBe("Notes");
  expect(name("/home/me/notes")).toBe("notes");
  expect(name("\\\\server\\share\\Notes")).toBe("Notes");
  expect(name("C:\\")).toBe("C:");
  expect(name("/")).toBe("/");
});

test("opening a folder again finds the same workspace, however its path is written", () => {
  const { workspaces, workspace: made } = workspaceForFolder([], "C:\\Docs\\Notes");
  for (const again of ["C:\\Docs\\Notes", "c:\\docs\\NOTES", "C:/Docs/Notes", "C:\\Docs\\Notes\\", "c:/docs/notes/"]) {
    const found = workspaceForFolder(workspaces, again);
    expect(found.workspace.id, again).toBe(made.id);
    expect(found.workspaces, again).toBe(workspaces);
  }
});

test("network folders compare without regard to case, and Unix folders with it", () => {
  const network = workspaceForFolder([], "\\\\Server\\Share\\Notes");
  expect(workspaceForFolder(network.workspaces, "//server/share/notes/").workspace.id).toBe(network.workspace.id);
  const unix = workspaceForFolder([], "/home/me/Notes");
  expect(workspaceForFolder(unix.workspaces, "/home/me/Notes/").workspace.id).toBe(unix.workspace.id);
  expect(workspaceForFolder(unix.workspaces, "/home/me/notes").workspace.id).not.toBe(unix.workspace.id);
});

test("paths compare as samePath does", () => {
  for (const [a, b] of [
    ["C:\\Docs\\a.md", "c:\\docs\\A.md"],
    ["/docs/a.md", "/docs/A.md"],
    ["/docs/a.md", "/docs/a.md"],
    ["C:\\Docs\\a.md", "C:\\Docs\\b.md"],
  ]) {
    const w = workspace([document(a)]);
    expect(addItem(w, document(b)).items.length === 1, `${a} ${b}`).toBe(samePath(a, b));
  }
});

test("a different folder gets its own workspace with its own id", () => {
  const first = workspaceForFolder([], "C:\\Docs\\Notes");
  const second = workspaceForFolder(first.workspaces, "D:\\Docs\\Notes");
  expect(second.workspace.id).not.toBe(first.workspace.id);
  expect(second.workspaces).toHaveLength(2);
});

test("a workspace a folder was only added to is not that folder's workspace", () => {
  const other = addItem(workspace([folder("C:\\Other")]), folder("C:\\Notes"));
  expect(workspaceForFolder([other], "C:\\Notes").workspace.id).not.toBe(other.id);
  expect(workspaceForFolder([workspace([document("C:\\Notes")])], "C:\\Notes").workspace.id).not.toBe("w");
});

test("Pinned is added once, first, and can't be deleted", () => {
  const other = workspace([]);
  const list = withPinned([other]);
  expect(list).toEqual([PINNED, other]);
  expect(withPinned(list)).toBe(list);
  expect(deleteWorkspace(list, PINNED.id)).toBe(list);
  expect(deleteWorkspace(list, "w")).toEqual([PINNED]);
});

test("adding an item doesn't change the workspace it came from", () => {
  const w = workspace([folder("C:\\A")]);
  const added = addItem(w, document("C:\\B\\b.md"));
  expect(added.items).toEqual([folder("C:\\A"), document("C:\\B\\b.md")]);
  expect(w.items).toEqual([folder("C:\\A")]);
});

test("an item is added once", () => {
  const w = workspace([folder("C:\\A")]);
  expect(addItem(w, folder("c:/a/")).items).toEqual([folder("C:\\A")]);
});

test("removing hides a path, once, and restoring shows it again", () => {
  const w = workspace([folder("C:\\A")]);
  const scans = { "C:\\A": ["C:\\A\\a.md", "C:\\A\\b.md"] };
  const removed = removeItem(w, "C:\\A\\a.md");
  expect(paths(removed, scans)).toEqual(["C:\\A\\b.md"]);
  expect(removeItem(removed, "c:/a/A.md")).toBe(removed);
  expect(restorePath(removed, "c:/a/A.md").removed).toEqual([]);
  expect(paths(restorePath(removed, "c:/a/A.md"), scans)).toEqual(scans["C:\\A"]);
});

test("removing a folder item keeps the item, so restoring brings the folder back", () => {
  const w = removeItem(workspace([folder("C:\\A")]), "C:\\A");
  const scans = { "C:\\A": ["C:\\A\\a.md"] };
  expect(paths(w, scans)).toEqual([]);
  expect(paths(restorePath(w, "C:\\A"), scans)).toEqual(scans["C:\\A"]);
});

test("adding a removed path back shows it", () => {
  const w = workspace([document("C:\\A\\a.md")], ["C:\\A\\a.md"]);
  const added = addItem(w, document("C:\\A\\a.md"));
  expect(added.removed).toEqual([]);
  expect(added.items).toHaveLength(1);
});

test("the visible documents leave out removed paths and everything under a removed folder", () => {
  const scans = { "C:\\A": ["C:\\A\\a.md", "C:\\A\\old\\b.md", "C:\\A\\old\\deep\\c.md", "C:\\A\\older\\d.md", "C:\\A\\e.md"] };
  const w = workspace([folder("C:\\A")], ["c:/a/OLD", "C:\\A\\e.md"]);
  expect(paths(w, scans)).toEqual(["C:\\A\\a.md", "C:\\A\\older\\d.md"]);
});

test("a removed drive root hides all of its documents", () => {
  expect(paths(workspace([folder("C:\\")], ["C:\\"]), { "C:\\": ["C:\\a.md"] })).toEqual([]);
});

test("hand-picked documents show without a scan, under their own folder", () => {
  const w = workspace([document("C:\\A\\a.md"), document("D:\\B\\b.md")]);
  expect(visibleDocuments(w, {})).toEqual([
    { path: "C:\\A\\a.md", root: "C:\\A", relative: "a.md" },
    { path: "D:\\B\\b.md", root: "D:\\B", relative: "b.md" },
  ]);
});

test("a folder that has no scan yet shows nothing", () => {
  expect(paths(workspace([folder("C:\\A")]), {})).toEqual([]);
});

test("a document in overlapping folders shows once, under the outer folder, in either order", () => {
  const scans = { "C:\\A": ["C:\\A\\a.md", "C:\\A\\sub\\b.md"], "c:\\a\\SUB": ["c:\\a\\SUB\\b.md"] };
  for (const items of [
    [folder("C:\\A"), folder("c:\\a\\SUB")],
    [folder("c:\\a\\SUB"), folder("C:\\A")],
  ]) {
    expect(visibleDocuments(workspace(items), scans)).toEqual([
      { path: "C:\\A\\a.md", root: "C:\\A", relative: "a.md" },
      { path: "C:\\A\\sub\\b.md", root: "C:\\A", relative: "sub/b.md" },
    ]);
  }
});

test("a hand-picked document inside a scanned folder shows once", () => {
  const w = workspace([document("c:\\a\\A.md"), folder("C:\\A")]);
  expect(visibleDocuments(w, { "C:\\A": ["C:\\A\\a.md"] })).toEqual([{ path: "C:\\A\\a.md", root: "C:\\A", relative: "a.md" }]);
});

test("a large workspace lists and builds a tree", () => {
  const files = Array.from({ length: 50_000 }, (_, i) => `C:\\A\\f${i % 100}\\${i}.md`);
  const docs = visibleDocuments(workspace([folder("C:\\A")], ["C:\\A\\f1"]), { "C:\\A": files });
  expect(docs).toHaveLength(49_500);
  expect(fileTree(docs)[0].kind).toBe("folder");
});

test("the tree holds folders first, sorted, and nothing without a document", () => {
  const scans = { "C:\\A": ["C:\\A\\b.md", "C:\\A\\a.md", "C:\\A\\z\\deep\\c.md", "C:\\A\\f10\\d.md", "C:\\A\\f2\\e.md"] };
  const tree = fileTree(visibleDocuments(workspace([folder("C:\\A")], ["C:\\A\\f10\\d.md"]), scans));
  const names = (nodes: ReturnType<typeof fileTree>): unknown[] =>
    nodes.map((n) => (n.kind === "folder" ? { [n.name]: names(n.children) } : n.name));
  expect(names(tree)).toEqual([{ A: [{ f2: ["e.md"] }, { z: [{ deep: ["c.md"] }] }, "a.md", "b.md"] }]);
});

test("tree folders and documents carry their full paths", () => {
  const tree = fileTree(visibleDocuments(workspace([folder("C:\\A")]), { "C:\\A": ["C:\\A\\sub\\a.md"] }));
  expect(tree).toEqual([
    {
      kind: "folder",
      name: "A",
      path: "C:\\A",
      children: [
        {
          kind: "folder",
          name: "sub",
          path: "C:\\A\\sub",
          children: [{ kind: "document", name: "a.md", path: "C:\\A\\sub\\a.md" }],
        },
      ],
    },
  ]);
});

test("the tree works at a drive root and on Unix paths", () => {
  const first = (path: string, scan: string) => fileTree(visibleDocuments(workspace([folder(path)]), { [path]: [scan] }))[0];
  expect(first("C:\\", "C:\\sub\\a.md")).toMatchObject({ name: "C:", path: "C:\\", children: [{ path: "C:\\sub" }] });
  expect(first("/home/me", "/home/me/sub/a.md")).toMatchObject({ name: "me", children: [{ path: "/home/me/sub" }] });
});

test("hand-picked documents from one folder share a node, and several roots each get one", () => {
  const docs = visibleDocuments(workspace([document("C:\\B\\b.md"), document("C:\\B\\a.md"), document("C:\\A\\c.md")]), {});
  expect(fileTree(docs).map((n) => [n.name, n.kind === "folder" && n.children.map((c) => c.name)])).toEqual([
    ["A", ["c.md"]],
    ["B", ["a.md", "b.md"]],
  ]);
});

const docs = ["audit/economy.md", "audit/security.md", "notes/econ.md", "Notes/Audit Econ.md"].map((relative) => ({
  path: `C:\\R\\${relative}`,
  root: "C:\\R",
  relative,
}));
const found = (query: string) => filterDocuments(docs, query).map((d) => d.relative);

test("every word must match the relative path, in any order", () => {
  expect(found("audit econ")).toEqual(["audit/economy.md", "Notes/Audit Econ.md"]);
  expect(found("econ audit")).toEqual(["audit/economy.md", "Notes/Audit Econ.md"]);
  expect(found("audit missing")).toEqual([]);
});

test("the filter ignores case and matches across folders, with either slash", () => {
  expect(found("NOTES")).toEqual(["notes/econ.md", "Notes/Audit Econ.md"]);
  expect(found("audit/sec")).toEqual(["audit/security.md"]);
  expect(found("audit\\sec")).toEqual(["audit/security.md"]);
});

test("the filter doesn't match the part of the path above the root", () => {
  const scattered = [{ path: "C:\\audit\\a.md", root: "C:\\audit", relative: "a.md" }];
  expect(filterDocuments(scattered, "audit")).toEqual([]);
});

test("an empty query keeps every document", () => {
  expect(found("")).toHaveLength(4);
  expect(found("   ")).toHaveLength(4);
});
