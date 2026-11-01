import { expect, test } from "vitest";
import { joinPath, protectDrivePath, relativePath, resolveLocal, resolveSrcset } from "./paths";

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

test.each([
  ["forward slashes", "C:/pics/a.png"],
  ["backslashes, as raw HTML keeps them", "C:\\pics\\a.png"],
  ["escaped backslashes, as Markdown leaves them", "C:%5Cpics%5Ca.png"],
  ["a query", "C:/pics/a.png?v=1"],
  ["a protected colon", protectDrivePath("c:/pics/a.png")],
  ["a climb", "C:/pics/x/../a.png"],
])("an absolute drive path reaches toUrl: %s", (_, src) => {
  const asked: string[] = [];
  resolveLocal(SHARE, src, (path) => (asked.push(path), url(path)));
  expect(asked).toHaveLength(1);
  expect(asked[0].replace(/\\/g, "/")).toMatch(/^[cC]:\/pics\/a\.png$/);
});

test("only a drive path gets its colon hidden", () => {
  expect(protectDrivePath("C:/pics/a.png")).toBe("C%3A/pics/a.png");
  expect(protectDrivePath("C:%5Cpics%5Ca.png")).toBe("C%3A%5Cpics%5Ca.png");
  for (const src of ["a.png", "img/a:b.png", "https://x.org/a.png", "javascript:alert(1)", "data:image/png;base64,AA", "mailto:a@b.c", "C:file.png", "ab:/x.png"]) {
    expect(protectDrivePath(src)).toBe(src);
  }
});

test("a srcset maps every candidate and keeps its descriptor", () => {
  const set = (srcset: string) => resolveSrcset("C:\\Docs", srcset, url);
  expect(set("a.png")).toBe("asset:C:\\Docs\\a.png");
  expect(set("img/a.png 1x, ../b%20c.png 2x")).toBe("asset:C:\\Docs\\img\\a.png 1x, asset:C:\\b c.png 2x");
  expect(set("  a.png 480w ,b.png 800w,  ")).toBe("asset:C:\\Docs\\a.png 480w, asset:C:\\Docs\\b.png 800w");
  expect(set("a.png, b.png 2x")).toBe("asset:C:\\Docs\\a.png, asset:C:\\Docs\\b.png 2x");
  expect(set("https://x.org/a.png 2x, data:image/png;base64,AA")).toBe("https://x.org/a.png 2x, data:image/png;base64,AA");
  expect(set("C:/pics/a.png 2x")).toBe("asset:C:/pics/a.png 2x");
  expect(set(" , ,")).toBe("");
});

test("an image on another server stays blocked through srcset", () => {
  const asked: string[] = [];
  const track = (path: string) => (asked.push(path), url(path));
  expect(resolveSrcset(SHARE, "//other/share/a.png 1x, %5C%5Cother%5Cshare%5Cb.png 2x", track)).toBe(
    "//other/share/a.png 1x, asset:\\\\Server\\share\\docs\\other\\share\\b.png 2x",
  );
  expect(resolveSrcset(SHARE, "//server/share/c.png 2x", track)).toBe("asset:\\\\server\\share\\c.png 2x");
  expect(asked).toEqual(["\\\\Server\\share\\docs\\other\\share\\b.png", "\\\\server\\share\\c.png"]);
});
