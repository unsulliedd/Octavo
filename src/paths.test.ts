import { expect, test } from "vitest";
import { relativePath } from "./paths";

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
