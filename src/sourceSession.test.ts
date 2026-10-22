import { expect, test } from "vitest";
import { sourceSession } from "./sourceSession";

test("the source counts as edited until its text is saved or typed back", () => {
  let text = "# T\n";
  const s = sourceSession(text, () => text);
  expect(s.edited()).toBe(false);
  text = "# T\n\nMore\n";
  expect(s.edited()).toBe(true);
  const snapshot = s.snapshot();
  expect(snapshot).toEqual({ markdown: "# T\n\nMore\n", exact: true, source: true });
  text += "Later\n";
  s.markSaved(snapshot);
  // Typing after the snapshot is still unsaved.
  expect(s.edited()).toBe(true);
  text = "# T\n\nMore\n";
  expect(s.edited()).toBe(false);
});
