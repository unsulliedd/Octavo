import { expect, test } from "vitest";
import { cleanKey, displayValue, parseProperties, serializeProperties } from "./properties";

test("name and value lines become rows", () => {
  expect(parseProperties("title: Octavo showcase\ntags: [showcase, test]\n\ndraft:\n")).toEqual([
    { key: "title", value: "Octavo showcase" },
    { key: "tags", value: "[showcase, test]" },
    { key: "draft", value: "" },
  ]);
  expect(parseProperties("")).toEqual([]);
  expect(parseProperties("last updated: 2026-10-19\r\nquote: \"a: b\"")).toEqual([
    { key: "last updated", value: "2026-10-19" },
    { key: "quote", value: '"a: b"' },
  ]);
});

test("YAML that goes deeper is not made into rows", () => {
  expect(parseProperties("owners:\n  - design\n  - editor")).toBeUndefined();
  expect(parseProperties("release:\n  version: 0.5")).toBeUndefined();
  expect(parseProperties("summary: |\n  two\n  lines")).toBeUndefined();
  expect(parseProperties("# a comment\ntitle: x")).toBeUndefined();
  expect(parseProperties("title: x\n- item")).toBeUndefined();
});

test("rows are written back as YAML", () => {
  const yaml = "title: Octavo showcase\ntags: [showcase, test]\ndraft:";
  expect(serializeProperties(parseProperties(yaml)!)).toBe(yaml);
  expect(serializeProperties([{ key: " title ", value: " x " }, { key: "", value: "dropped" }])).toBe("title: x");
});

test("a value that would break the YAML is quoted", () => {
  expect(serializeProperties([{ key: "note", value: 'Note: say "hi"' }])).toBe('note: "Note: say \\"hi\\""');
  expect(serializeProperties([{ key: "tag", value: "a #b" }])).toBe('tag: "a #b"');
  expect(serializeProperties([{ key: "q", value: '"a: b"' }])).toBe('q: "a: b"');
  expect(serializeProperties([{ key: "url", value: "https://x.dev" }])).toBe("url: https://x.dev");
});

test("names lose the characters YAML can't have in them", () => {
  expect(cleanKey("a:b#c")).toBe("abc");
});

test("values as the reading view shows them", () => {
  expect(displayValue("Octavo showcase")).toBe("Octavo showcase");
  expect(displayValue('"a: b"')).toBe("a: b");
  expect(displayValue("'quoted'")).toBe("quoted");
  expect(displayValue('"say \\"hi\\""')).toBe('say "hi"');
  expect(displayValue("[showcase, 'big test', ]")).toEqual(["showcase", "big test"]);
  expect(displayValue("[]")).toEqual([]);
});
