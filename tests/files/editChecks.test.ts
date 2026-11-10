// @vitest-environment jsdom
import { beforeEach, expect, test } from "vitest";
import { checkKey, KEPT_CHECKS, passedBefore, rememberPassed } from "@/files/editChecks";

beforeEach(() => localStorage.clear());

test("the key is the same for the same version, path and text, and different when any of them changes", async () => {
  const key = await checkKey("1.0.0", "C:\\notes\\a.md", "# Title\n");
  expect(await checkKey("1.0.0", "C:\\notes\\a.md", "# Title\n")).toBe(key);
  expect(await checkKey("1.0.1", "C:\\notes\\a.md", "# Title\n")).not.toBe(key);
  expect(await checkKey("1.0.0", "C:\\notes\\b.md", "# Title\n")).not.toBe(key);
  expect(await checkKey("1.0.0", "C:\\notes\\a.md", "# Title\r\n")).not.toBe(key);
  expect(await checkKey("1.0.0", "C:\\notes\\a.md", "# Title")).not.toBe(key);
});

test("a remembered pass covers only its own key", async () => {
  const key = await checkKey("1.0.0", "a.md", "text");
  expect(passedBefore(key)).toBe(false);
  rememberPassed(key);
  expect(passedBefore(key)).toBe(true);
  expect(passedBefore(await checkKey("1.0.0", "a.md", "text changed"))).toBe(false);
  expect(passedBefore(await checkKey("1.1.0", "a.md", "text"))).toBe(false);
});

test("only the newest passes are kept, and remembering one again makes it the newest", () => {
  for (let i = 0; i < KEPT_CHECKS; i++) rememberPassed(`k${i}`);
  rememberPassed("k0");
  rememberPassed("new");
  expect(passedBefore("k0")).toBe(true);
  expect(passedBefore("new")).toBe(true);
  expect(passedBefore("k1")).toBe(false);
  expect(JSON.parse(localStorage.getItem("editChecks")!)).toHaveLength(KEPT_CHECKS);
});

test("stored junk counts as no remembered passes", () => {
  localStorage.setItem("editChecks", '{"not": "a list"}');
  expect(passedBefore("not")).toBe(false);
  localStorage.setItem("editChecks", "[1, null, \"k\"]");
  expect(passedBefore("k")).toBe(true);
  expect(passedBefore("1")).toBe(false);
});
