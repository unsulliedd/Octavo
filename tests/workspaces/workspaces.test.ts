import { expect, test } from "vitest";
import { samePath } from "@/tabs/tabs";
import {
  PINNED,
  type Workspace,
  addItem,
  dropItem,
  pinnedPaths,
  removeEntry,
  same,
  togglePin,
  withPins,
  deleteWorkspace,
  fileTree,
  filterDocuments,
  removeItem,
  restorePath,
  latestRun,
  problemText,
  scanResult,
  toFront,
  visibleDocuments,
  withCover,
  withPinned,
  workspaceForFolder,
  workspacePlace,
  addTargets,
  holds,
  newWorkspace,
  renameWorkspace,
  workspaceKind,
} from "@/workspaces/workspaces";

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

test("Pinned is added once, last, and can't be deleted", () => {
  const other = workspace([]);
  const list = withPinned([other]);
  expect(list).toEqual([other, PINNED]);
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

test("toFront moves a workspace first and leaves the list as it is when it already is", () => {
  const [a, b, c] = ["a", "b", "c"].map((id) => ({ ...workspace([]), id }));
  expect(toFront([a, b, c], "c")).toEqual([c, a, b]);
  const list = [a, b];
  expect(toFront(list, "a")).toBe(list);
  expect(toFront(list, "missing")).toBe(list);
});

test("a workspace's place is its folder's last names, or how many items it holds", () => {
  expect(workspacePlace(workspace([folder("C:\\Users\\me\\Documents\\Github\\Handbook\\")]))).toBe("me › Documents › Github › Handbook");
  expect(workspacePlace(workspace([document("C:\\a.md")]))).toBe("1 document");
  expect(workspacePlace(workspace([folder("C:\\a"), folder("C:\\b"), document("C:\\c.md")]))).toBe("2 folders, 1 document");
  expect(workspacePlace(workspace([]))).toBe("Empty");
});

test("the problem text names the copy and the reason", () => {
  expect(problemText({ reason: "corrupt", copy: "C:\\w.corrupt.json" })).toBe("The saved workspaces couldn't be read. A copy of the file is kept at:\n\nC:\\w.corrupt.json");
  expect(problemText({ reason: "newer", copy: "C:\\w.newer.json" })).toContain("newer version");
});

test("a scan result gathers files, errors and whether a scan was cut off", () => {
  const result = scanResult("w", ["C:\\a", "C:\\b", "C:\\c"], [{ files: ["C:\\a\\x.md"], truncated: false }, "denied", { files: [], truncated: true }]);
  expect(result).toEqual({ id: "w", scans: { "C:\\a": ["C:\\a\\x.md"], "C:\\c": [] }, truncated: true, errors: ["Couldn't read C:\\b: denied"], roots: {}, missing: [] });
});

test("a scan with the same outcome keeps the earlier result, and one that differs replaces it", () => {
  const first = scanResult("w", ["C:\\a"], [{ files: ["x"], truncated: false }]);
  expect(scanResult("w", ["C:\\a"], [{ files: ["x"], truncated: false }], first)).toBe(first);
  expect(scanResult("w", ["C:\\a"], [{ files: ["y"], truncated: false }], first)).not.toBe(first);
  expect(scanResult("w", ["C:\\a"], [{ files: ["x"], truncated: true }], first)).not.toBe(first);
  expect(scanResult("v", ["C:\\a"], [{ files: ["x"], truncated: false }], first)).not.toBe(first);
  expect(scanResult("w", ["C:\\a"], [{ files: ["x"], truncated: false }], first, {}, ["C:\\b.md"])).not.toBe(first);
  expect(scanResult("w", ["C:\\a"], [{ files: ["x"], truncated: false }], first, { "C:\\b.md": "C:\\" })).not.toBe(first);
});

test("only the latest run holds", () => {
  const start = latestRun();
  const first = start();
  expect(first()).toBe(true);
  const second = start();
  expect(first()).toBe(false);
  expect(second()).toBe(true);
});

const pinned = (items: Workspace["items"], removed: string[] = []): Workspace => ({ ...PINNED, items, removed });

test("dropping an item takes it out for good and leaves nothing to bring back", () => {
  const w = workspace([document("C:\\A\\a.md"), document("C:\\A\\b.md")], ["c:/a/A.MD", "C:\\A\\c.md"]);
  const dropped = dropItem(w, "C:\\A\\a.md");
  expect(dropped.items).toEqual([document("C:\\A\\b.md")]);
  expect(dropped.removed).toEqual(["C:\\A\\c.md"]);
  expect(dropItem(w, "C:\\A\\a.md")).not.toBe(w);
  expect(w.items).toHaveLength(2);
});

test("hiding leaves the item in place, unlike dropping", () => {
  const w = workspace([document("C:\\A\\a.md")]);
  expect(removeItem(w, "C:\\A\\a.md").items).toEqual(w.items);
  expect(dropItem(w, "C:\\A\\a.md").items).toEqual([]);
});

test("Remove from workspace hides, except that an entry of Pinned is unpinned", () => {
  const doc = "C:\\A\\a.md";
  expect(removeEntry(workspace([document(doc)]), doc)).toEqual(workspace([document(doc)], [doc]));
  expect(removeEntry(pinned([document(doc)]), doc)).toEqual(pinned([]));
  const inFolder = pinned([folder("C:\\A")]);
  expect(removeEntry(inFolder, doc)).toEqual(pinned([folder("C:\\A")], [doc]));
});

test("adding shows a document again when a folder around it was removed", () => {
  const w = workspace([folder("C:\\A")], ["C:\\A\\sub", "C:\\A\\other"]);
  const added = addItem(w, document("C:\\A\\sub\\deep\\a.md"));
  expect(added.removed).toEqual(["C:\\A\\other"]);
  expect(paths(added, { "C:\\A": [] })).toEqual(["C:\\A\\sub\\deep\\a.md"]);
});

test("a folder inside a folder of the workspace is only shown again, not added", () => {
  const w = workspace([folder("C:\\A")], ["C:\\A\\sub"]);
  expect(addItem(w, folder("C:\\A\\sub"))).toEqual(workspace([folder("C:\\A")]));
  expect(addItem(w, folder("C:\\AB")).items).toEqual([folder("C:\\A"), folder("C:\\AB")]);
  expect(addItem(w, document("C:\\A\\sub\\a.md")).items).toHaveLength(2);
});

test("an added document groups under its folder in the roots, or its own without one", () => {
  const w = workspace([document("C:\\Repo\\docs\\a.md"), document("C:\\Other\\b.md")]);
  const docs = visibleDocuments(w, {}, { "C:\\Repo\\docs\\a.md": "C:\\Repo" });
  expect(docs).toEqual([
    { path: "C:\\Repo\\docs\\a.md", root: "C:\\Repo", relative: "docs/a.md" },
    { path: "C:\\Other\\b.md", root: "C:\\Other", relative: "b.md" },
  ]);
  expect(fileTree(docs).map((n) => n.name)).toEqual(["Other", "Repo"]);
});

test("a document that is gone is marked in the list and the tree", () => {
  const w = workspace([document("C:\\A\\a.md"), document("C:\\A\\b.md")]);
  const docs = visibleDocuments(w, {}, {}, ["C:\\A\\b.md"]);
  expect(docs.map((d) => d.missing)).toEqual([undefined, true]);
  expect(fileTree(docs)[0]).toMatchObject({ children: [{ name: "a.md" }, { name: "b.md", missing: true }] });
});

test("pins merge into Pinned without duplicates, and what Pinned holds stays first", () => {
  const list = withPinned([workspace([])]);
  const once = withPins(list, ["C:\\A\\a.md", "c:/a/A.MD", "C:\\B\\b.md"]);
  expect(pinnedPaths(once)).toEqual(["C:\\A\\a.md", "C:\\B\\b.md"]);
  expect(pinnedPaths(withPins(once, ["C:\\B\\b.md", "C:\\C\\c.md"]))).toEqual(["C:\\A\\a.md", "C:\\B\\b.md", "C:\\C\\c.md"]);
  expect(once[0]).toBe(list[0]);
});

test("a pin that was hidden shows again when it is merged", () => {
  expect(pinnedPaths(withPins([pinned([document("C:\\a.md")], ["C:\\a.md"])], ["C:\\a.md"]))).toEqual(["C:\\a.md"]);
});

test("the pin button adds a document and really removes it", () => {
  const on = togglePin(pinned([]), "C:\\a.md");
  expect(on.items).toEqual([document("C:\\a.md")]);
  expect(togglePin(on, "C:\\a.md").items).toEqual([]);
  expect(togglePin(on, "c:/A.md").items).toEqual([]);
});

test("two spellings of a path are the same one", () => {
  expect(same("C:\\A\\a.md", "c:/a/A.MD")).toBe(true);
  expect(same("C:\\A\\a.md", "C:\\A\\b.md")).toBe(false);
});

test("a workspace's kind: Pinned, one made with New workspace, or a folder's", () => {
  expect(workspaceKind(PINNED)).toBe("pinned");
  expect(workspaceKind(workspaceForFolder([], "C:\\Notes").workspace)).toBe("folder");
  const own = newWorkspace([], "Reading list").workspace;
  expect(workspaceKind(own)).toBe("own");
  // Holding one folder, as a folder's workspace does, doesn't make it one.
  expect(workspaceKind(addItem(own, folder("C:\\Notes")))).toBe("own");
  // Without the mark, a saved workspace is a folder's, whatever it holds.
  expect(workspaceKind(workspace([]))).toBe("folder");
});

test("Open folder… never finds an own workspace or Pinned that starts with that folder", () => {
  const own = addItem(newWorkspace([], "Mine").workspace, folder("C:\\Notes"));
  const pins = pinned([folder("C:\\Notes")]);
  const { workspaces, workspace: found } = workspaceForFolder([own, pins], "C:\\Notes");
  expect([own.id, PINNED.id]).not.toContain(found.id);
  expect(workspaceKind(found)).toBe("folder");
  expect(workspaces).toHaveLength(3);
});

test("a new workspace is empty, trimmed, marked as the user's own and put first", () => {
  const list = [workspace([]), PINNED];
  const { workspaces, workspace: made } = newWorkspace(list, "  Travel ");
  expect(made).toEqual({ id: made.id, name: "Travel", items: [], removed: [], own: true });
  expect(workspaces).toEqual([made, ...list]);
  expect(newWorkspace(list, "Travel").workspace.id).not.toBe(made.id);
  expect(newWorkspace(list, "With one", [document("C:\\a.md")]).workspace.items).toEqual([document("C:\\a.md")]);
});

test("renaming trims the name, allows duplicates and leaves Pinned and empty names alone", () => {
  const a = { ...workspace([folder("C:\\A")]), id: "a" };
  const b = { ...workspace([]), id: "b", own: true as const };
  const list = [a, b, PINNED];
  expect(renameWorkspace(list, "a", "  Handbook  ")).toEqual([{ ...a, name: "Handbook" }, b, PINNED]);
  expect(renameWorkspace(list, "b", " w ")).toBe(list);
  expect(renameWorkspace(list, "missing", "x")).toBe(list);
  expect(renameWorkspace(renameWorkspace(list, "a", "Same"), "b", "Same").map((w) => w.name)).toEqual(["Same", "Same", "Pinned"]);
  expect(renameWorkspace(list, "a", "   ")).toBe(list);
  expect(renameWorkspace(list, PINNED.id, "Favourites")).toBe(list);
  // Only the name changes: a folder workspace keeps its items.
  expect(renameWorkspace(list, "a", "New")[0].items).toBe(a.items);
});

test("a workspace holds a path itself or through a folder, unless it was removed", () => {
  const w = workspace([folder("C:\\Docs"), document("D:\\b.md")], ["C:\\Docs\\old"]);
  expect(holds(w, "C:\\Docs\\a.md")).toBe(true);
  expect(holds(w, "c:/docs/")).toBe(true);
  expect(holds(w, "C:\\Docs\\sub")).toBe(true);
  expect(holds(w, "d:/B.md")).toBe(true);
  expect(holds(w, "C:\\Docs\\old\\c.md")).toBe(false);
  expect(holds(w, "C:\\Docs\\old")).toBe(false);
  expect(holds(w, "C:\\Docsy\\a.md")).toBe(false);
  expect(holds(w, "C:\\")).toBe(false);
  // A document item doesn't hold the folder it is in.
  expect(holds(w, "D:\\")).toBe(false);
});

test("Add to offers Pinned and own workspaces in the saved order, never a folder's, each saying whether it holds the path", () => {
  const folderWs = workspaceForFolder([], "C:\\Docs").workspace;
  const travel = addItem(newWorkspace([], "Travel").workspace, document("C:\\Docs\\a.md"));
  const reading = addItem(newWorkspace([], "Reading").workspace, folder("C:\\Docs"));
  const pins = pinned([document("C:\\b.md")]);
  const targets = addTargets([reading, folderWs, travel, pins], "C:\\Docs\\a.md");
  expect(targets.map((t) => [t.workspace.name, t.held])).toEqual([
    ["Pinned", false],
    ["Reading", true],
    ["Travel", true],
  ]);
  expect(addTargets([reading, folderWs, travel, pins], "C:\\b.md").map((t) => t.held)).toEqual([true, false, false]);
  expect(addTargets([folderWs], "C:\\Docs\\a.md")).toEqual([]);
});

test("a document inside a pinned folder that is also pinned on its own shows once, inside the folder", () => {
  const pins = addItem(pinned([document("C:\\Docs\\sub\\a.md"), document("C:\\b.md")]), folder("C:\\Docs"));
  expect(pins.items).toEqual([document("C:\\Docs\\sub\\a.md"), document("C:\\b.md"), folder("C:\\Docs")]);
  const docs = visibleDocuments(pins, { "C:\\Docs": ["C:\\Docs\\sub\\a.md", "C:\\Docs\\c.md"] });
  expect(docs.map((d) => [d.path, d.root])).toEqual([
    ["C:\\Docs\\sub\\a.md", "C:\\Docs"],
    ["C:\\Docs\\c.md", "C:\\Docs"],
    ["C:\\b.md", "C:"],
  ]);
  // A pinned folder is a folder at the top, and documents pinned by themselves follow it.
  expect(fileTree(docs, ["C:\\Docs"]).map((n) => [n.kind, n.name])).toEqual([
    ["folder", "Docs"],
    ["document", "b.md"],
  ]);
  // The documents pinned by themselves are still the pins Home lists.
  expect(pinnedPaths([pins])).toEqual(["C:\\Docs\\sub\\a.md", "C:\\b.md"]);
});

test("with its folders given, the tree lists documents outside them at the top, sorted after the folders", () => {
  const docs = [
    { path: "C:\\Notes\\z.md", root: "C:\\Notes", relative: "z.md" },
    { path: "C:\\Game\\levels\\a.md", root: "C:\\Game", relative: "levels/a.md" },
    { path: "D:\\x\\gone.md", root: "D:\\x", relative: "gone.md", missing: true },
  ];
  expect(fileTree(docs, ["c:/game"])).toEqual([
    { kind: "folder", name: "Game", path: "C:\\Game", children: [{ kind: "folder", name: "levels", path: "C:\\Game\\levels", children: [{ kind: "document", name: "a.md", path: "C:\\Game\\levels\\a.md", missing: undefined }] }] },
    { kind: "document", name: "gone.md", path: "D:\\x\\gone.md", missing: true },
    { kind: "document", name: "z.md", path: "C:\\Notes\\z.md", missing: undefined },
  ]);
});

test("withCover sets or clears the cover of one workspace only", () => {
  const a: Workspace = { id: "a", name: "A", items: [], removed: [] };
  const b: Workspace = { id: "b", name: "B", items: [], removed: [], cover: "b.png" };
  const set = withCover([a, b], "a", "a.jpg");
  expect(set).toEqual([{ ...a, cover: "a.jpg" }, b]);
  expect(set[1]).toBe(b);
  const cleared = withCover(set, "b");
  expect(cleared[1].cover).toBeUndefined();
  expect(JSON.parse(JSON.stringify(cleared[1]))).toEqual({ id: "b", name: "B", items: [], removed: [] });
  expect(withCover([a], "missing", "x.png")).toEqual([a]);
});
