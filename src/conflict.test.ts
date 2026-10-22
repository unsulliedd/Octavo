import { expect, test } from "vitest";
import { diskChange } from "./conflict";

test("a change on disk conflicts only with unsaved edits made to an older version", () => {
  expect(diskChange({ disk: "new", base: "old", edited: true, editorOpen: true })).toBe("conflict");
  expect(diskChange({ disk: "new", base: "old", edited: true, editorOpen: false })).toBe("conflict");
  // The change is the app's own save, or a write of the same text.
  expect(diskChange({ disk: "same", base: "same", edited: true, editorOpen: true })).toBe("none");
});

test("an open editor without edits loads the new version", () => {
  expect(diskChange({ disk: "new", base: "old", edited: false, editorOpen: true })).toBe("reloadEditor");
  expect(diskChange({ disk: "new", base: "old", edited: false, editorOpen: false })).toBe("none");
});
