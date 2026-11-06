// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { applyColors, BASES, baseProperty, DEFAULT_BASES, parseHex, sanitizeColors, withBase } from "./colors";

test("a color is # and six hex digits, lowercased; # and three digits is widened", () => {
  expect(parseHex("#1F5FAD")).toBe("#1f5fad");
  expect(parseHex(" #1f5fad ")).toBe("#1f5fad");
  expect(parseHex("#AbC")).toBe("#aabbcc");
  for (const bad of ["", "#", "1f5fad", "#1f5fa", "#1f5fadd", "#1f5fag", "#abcd", "red", "rgb(0 0 0)", "#1f5fad;", "var(--x)"]) {
    expect(parseHex(bad)).toBeUndefined();
  }
});

test("setting a base color keeps only colors that differ from the default", () => {
  const changed = withBase({ base: {} }, "primary", "#1f5fad");
  expect(changed).toEqual({ base: { primary: "#1f5fad" } });
  expect(withBase(changed, "primary", DEFAULT_BASES.primary)).toEqual({ base: {} });
  expect(withBase(changed, "primary", undefined)).toEqual({ base: {} });
  expect(withBase(changed, "accent", "#000000")).toEqual({ base: { primary: "#1f5fad", accent: "#000000" } });
});

test("stored colors drop unknown keys, values that aren't colors and defaults", () => {
  expect(sanitizeColors({ base: { primary: "#1F5FAD", secondary: "#abc", accent: DEFAULT_BASES.accent, other: "#000000" } })).toEqual({
    base: { primary: "#1f5fad", secondary: "#aabbcc" },
  });
  expect(sanitizeColors({ base: { primary: 3, secondary: "url(x)", accent: "#12345" } })).toEqual({ base: {} });
  expect(sanitizeColors(JSON.parse('{"base":{"__proto__":{"primary":"#000000"}}}'))).toEqual({ base: {} });
  for (const junk of [undefined, null, "#000000", [], { base: [] }, { base: "x" }, { primary: "#000000" }]) {
    expect(sanitizeColors(junk)).toEqual({ base: {} });
  }
});

test("chosen colors become custom properties, and the others are removed so the defaults show", () => {
  const style = document.createElement("div").style;
  applyColors(style, { base: { primary: "#1f5fad", accent: "#00aa00" } });
  expect(style.getPropertyValue("--brand-primary")).toBe("#1f5fad");
  expect(style.getPropertyValue("--brand-accent")).toBe("#00aa00");
  expect(style.getPropertyValue("--brand-secondary")).toBe("");
  applyColors(style, { base: { accent: "#00aa00" } });
  expect(style.getPropertyValue("--brand-primary")).toBe("");
  applyColors(style, { base: {} });
  expect(style.cssText).toBe("");
});

test("the defaults are the base colors styles.css sets on the root", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  for (const key of BASES) expect(root).toContain(`${baseProperty(key)}: ${DEFAULT_BASES[key]};`);
});
