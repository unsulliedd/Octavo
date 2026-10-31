import { expect, test } from "vitest";
import { joinPath, relativePath, resolveLocal } from "./paths";

const SHARE = "\\\\Server\\share\\docs";
const url = (path: string) => `asset:${path}`;

test("a file relative to the document's folder", () => {
  expect(relativePath("C:\\Docs\\notes", "C:\\Docs\\notes\\img\\a.png")).toBe("img/a.png");
  expect(relativePath("C:\\Docs\\notes", "C:\\Docs\\shared\\a.png")).toBe("../shared/a.png");
  expect(relativePath("c:\\docs\\Notes", "C:\\Docs\\notes\\a.png")).toBe("a.png");
  expect(relativePath("/home/me/notes", "/home/me/notes/a.png")).toBe("a.png");
  expect(relativePath("/home/me/notes", "/srv/img/a.png")).toBe("../../../srv/img/a.png");
});

test("a file on another drive keeps its absolute path", () => {
  expect(relativePath("C:\\Docs", "D:\\Pictures\\a.png")).toBe("D:/Pictures/a.png");
});

test("a network path keeps its two leading separators and can't climb above its share", () => {
  expect(joinPath(SHARE, "img/a.png")).toBe("\\\\Server\\share\\docs\\img\\a.png");
  expect(joinPath(SHARE, "../img/a.png")).toBe("\\\\Server\\share\\img\\a.png");
  expect(joinPath(SHARE, "../../../a.png")).toBe("\\\\Server\\share\\a.png");
  expect(joinPath("//Server/share", "a.png")).toBe("//Server/share/a.png");
  expect(joinPath("C:\\Docs", "../../a.png")).toBe("C:\\a.png");
  expect(joinPath("/docs", "../../a.png")).toBe("/a.png");
});

test("a file on a network share is relative to a document on that share, ignoring case", () => {
  expect(relativePath(SHARE, "\\\\Server\\share\\docs\\img\\a.png")).toBe("img/a.png");
  expect(relativePath(SHARE, "\\\\SERVER\\Share\\img\\a.png")).toBe("../img/a.png");
});

test("a file on another server or share keeps its absolute path", () => {
  expect(relativePath(SHARE, "\\\\other\\share\\a.png")).toBe("//other/share/a.png");
  expect(relativePath(SHARE, "\\\\Server\\other\\a.png")).toBe("//Server/other/a.png");
  expect(relativePath("C:\\Docs", "\\\\Server\\share\\a.png")).toBe("//Server/share/a.png");
  expect(relativePath(SHARE, "C:\\Docs\\a.png")).toBe("C:/Docs/a.png");
});

test("a relative image of a document on a share resolves on that share", () => {
  expect(resolveLocal(SHARE, "img/my%20pic.png?v=1", url)).toBe("asset:\\\\Server\\share\\docs\\img\\my pic.png");
});

test.each([
  ["forward slashes", "//server/share/img/a.png"],
  ["escaped backslashes, as Markdown leaves them", "%5C%5Cserver%5Cshare%5Cimg%5Ca.png"],
  ["the one backslash Markdown leaves of an unescaped path", "\\server\\share\\img\\a.png"],
  ["backslashes in raw HTML", "\\\\server\\share\\img\\a.png"],
])("an absolute network image on the document's server loads: %s", (_, src) => {
  expect(resolveLocal(SHARE, src, url)).toBe("asset:\\\\server\\share\\img\\a.png");
});

test("an absolute network image on the document's server can't hide a climb", () => {
  expect(resolveLocal(SHARE, "//server/share/x/../../a.png", url)).toBe("asset:\\\\server\\share\\a.png");
});

test("a document can't load a network image from another server", () => {
  const asked: string[] = [];
  const track = (path: string) => (asked.push(path), url(path));
  expect(resolveLocal(SHARE, "//other/share/a.png", track)).toBe("//other/share/a.png");
  expect(resolveLocal("C:\\Docs", "//other/share/a.png", track)).toBe("//other/share/a.png");
  resolveLocal(SHARE, "%5C%5Cother%5Cshare%5Ca.png", track);
  resolveLocal("C:\\Docs", "%5C%5Cother%5Cshare%5Ca.png", track);
  expect(asked).toEqual(["\\\\Server\\share\\docs\\other\\share\\a.png", "C:\\Docs\\other\\share\\a.png"]);
});
