import { expect, test } from "vitest";
import { canRevert, revertText } from "./editSession";

test("nothing to revert outside a session or while nothing changed", () => {
  expect(canRevert({ original: undefined, onDisk: "a", unsaved: true })).toBe(false);
  expect(canRevert({ original: "a", onDisk: "a", unsaved: false })).toBe(false);
});

test("revert drops unsaved edits, and writes the original back once the file was saved", () => {
  expect(canRevert({ original: "a", onDisk: "a", unsaved: true })).toBe(true);
  expect(revertText({ original: "a", onDisk: "a", unsaved: true })).toBeUndefined();
  expect(canRevert({ original: "a", onDisk: "b", unsaved: false })).toBe(true);
  expect(revertText({ original: "a", onDisk: "b", unsaved: false })).toBe("a");
});
