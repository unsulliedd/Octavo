import { expect, test } from "vitest";
import { fenceLanguage, languageName, LANGUAGES, matchLanguages } from "./languages";

test("languages match by name or by what is written, those starting with the query first", () => {
  expect(matchLanguages("")).toBe(LANGUAGES);
  expect(matchLanguages("type")[0]).toBe("typescript");
  expect(matchLanguages("c#")).toEqual(["csharp"]);
  expect(matchLanguages("script")).toEqual(expect.arrayContaining(["javascript", "typescript"]));
  expect(matchLanguages("ja")[0]).toBe("java");
  expect(matchLanguages("diagram")).toEqual(["mermaid"]);
  expect(matchLanguages("klingon")).toEqual([]);
});

test("display names, with aliases and unknown languages", () => {
  expect(languageName("ts")).toBe("TypeScript");
  expect(languageName("PY")).toBe("Python");
  expect(languageName("zig")).toBe("zig");
});

test("a typed language is written as its first word", () => {
  expect(fenceLanguage("  zig  ")).toBe("zig");
  expect(fenceLanguage("objective c")).toBe("objective");
  expect(fenceLanguage("   ")).toBe("");
});

test("every offered language has a display name", () => {
  for (const id of LANGUAGES) expect(languageName(id)).not.toBe(id);
});
