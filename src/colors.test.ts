// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  anyChanged,
  applyColors,
  BASES,
  baseProperty,
  DEFAULT_BASES,
  DEFAULT_COLORS,
  GROUPS,
  parseHex,
  ROLE,
  ROLES,
  roleResetTip,
  roleTag,
  sanitizeColors,
  SETS,
  withBase,
  withoutGroup,
  withRole,
} from "./colors";

const none = DEFAULT_COLORS;

test("a color is # and six hex digits, lowercased; # and three digits is widened", () => {
  expect(parseHex("#1F5FAD")).toBe("#1f5fad");
  expect(parseHex(" #1f5fad ")).toBe("#1f5fad");
  expect(parseHex("#AbC")).toBe("#aabbcc");
  for (const bad of ["", "#", "1f5fad", "#1f5fa", "#1f5fadd", "#1f5fag", "#abcd", "red", "rgb(0 0 0)", "#1f5fad;", "var(--x)"]) {
    expect(parseHex(bad)).toBeUndefined();
  }
});

test("setting a base color keeps only colors that differ from the default", () => {
  const changed = withBase(none, "primary", "#1f5fad");
  expect(changed).toEqual({ ...none, base: { primary: "#1f5fad" } });
  expect(withBase(changed, "primary", DEFAULT_BASES.primary)).toEqual(none);
  expect(withBase(changed, "primary", undefined)).toEqual(none);
  expect(withBase(changed, "accent", "#000000")).toEqual({ ...none, base: { primary: "#1f5fad", accent: "#000000" } });
});

test("a role is set in one theme's set only, and back to its fixed default it isn't kept", () => {
  const changed = withRole(none, "light", "--doc", "#fffdf8");
  expect(changed).toEqual({ base: {}, light: { "--doc": "#fffdf8" }, dark: {} });
  expect(withRole(changed, "light", "--doc", "#ffffff")).toEqual(none);
  expect(withRole(changed, "light", "--doc", undefined)).toEqual(none);
  // A role that follows another color has no fixed default, so any color is kept.
  expect(withRole(none, "dark", "--link", "#75b7e5").dark).toEqual({ "--link": "#75b7e5" });
});

test("resetting a group clears its roles in that set only", () => {
  let colors = withRole(none, "light", "--chrome", "#f4f1ea");
  colors = withRole(colors, "light", "--ink", "#000000");
  colors = withRole(colors, "light", "--link", "#6fa8d6");
  colors = withRole(colors, "dark", "--chrome", "#000000");
  colors = withBase(colors, "accent", "#00aa00");
  expect(withoutGroup(colors, "light", "window")).toEqual({ base: { accent: "#00aa00" }, light: { "--link": "#6fa8d6" }, dark: { "--chrome": "#000000" } });
});

test("anything changed counts: a base color or a role in either set", () => {
  expect(anyChanged(none)).toBe(false);
  expect(anyChanged(withBase(none, "primary", "#000000"))).toBe(true);
  expect(anyChanged(withRole(none, "dark", "--doc", "#000000"))).toBe(true);
});

test("stored colors drop unknown keys, values that aren't colors and defaults", () => {
  expect(sanitizeColors({ base: { primary: "#1F5FAD", secondary: "#abc", accent: DEFAULT_BASES.accent, other: "#000000" } })).toEqual({
    ...none,
    base: { primary: "#1f5fad", secondary: "#aabbcc" },
  });
  expect(sanitizeColors({ base: { primary: 3, secondary: "url(x)", accent: "#12345" } })).toEqual(none);
  expect(sanitizeColors(JSON.parse('{"base":{"__proto__":{"primary":"#000000"}}}'))).toEqual(none);
  for (const junk of [undefined, null, "#000000", [], { base: [] }, { base: "x" }, { primary: "#000000" }]) {
    expect(sanitizeColors(junk)).toEqual(none);
  }
});

test("stored role sets keep known roles with valid colors, per set", () => {
  const stored = {
    base: { primary: "#1f5fad" },
    light: { "--doc": "#FFFDF8", "--link": "#abc", "--chrome": "#f3f4f6", "--backdrop": "#000000", "--brand-primary": "#000000", chrome: "#000000", "--ink": "red" },
    dark: { "--doc": "#101418", "--scroll-thumb": 5, "--tip": "var(--ink)" },
  };
  expect(sanitizeColors(stored)).toEqual({ base: { primary: "#1f5fad" }, light: { "--doc": "#fffdf8", "--link": "#aabbcc" }, dark: { "--doc": "#101418" } });
  expect(sanitizeColors({ base: {}, light: [], dark: "x" })).toEqual(none);
  expect(sanitizeColors(JSON.parse('{"light":{"__proto__":{"--doc":"#000000"}}}'))).toEqual(none);
});

test("colors saved before there were role sets load unchanged", () => {
  expect(sanitizeColors({ base: { primary: "#1f5fad", accent: "#2a9d8f" } })).toEqual({ base: { primary: "#1f5fad", accent: "#2a9d8f" }, light: {}, dark: {} });
});

test("chosen colors become custom properties, and the others are removed so the defaults show", () => {
  const style = document.createElement("div").style;
  applyColors(style, { ...none, base: { primary: "#1f5fad", accent: "#00aa00" } }, false);
  expect(style.getPropertyValue("--brand-primary")).toBe("#1f5fad");
  expect(style.getPropertyValue("--brand-accent")).toBe("#00aa00");
  expect(style.getPropertyValue("--brand-secondary")).toBe("");
  applyColors(style, { ...none, base: { accent: "#00aa00" } }, false);
  expect(style.getPropertyValue("--brand-primary")).toBe("");
  applyColors(style, none, false);
  expect(style.cssText).toBe("");
});

test("the set of the theme that shows applies, and switching the theme swaps it", () => {
  const style = document.createElement("div").style;
  const colors = { base: { primary: "#1f5fad" }, light: { "--doc": "#fffdf8", "--link": "#6fa8d6" }, dark: { "--doc": "#101418", "--scroll-thumb": "#445566" } };
  applyColors(style, colors, false);
  expect(style.getPropertyValue("--doc")).toBe("#fffdf8");
  expect(style.getPropertyValue("--link")).toBe("#6fa8d6");
  expect(style.getPropertyValue("--scroll-thumb")).toBe("");
  applyColors(style, colors, true);
  expect(style.getPropertyValue("--doc")).toBe("#101418");
  expect(style.getPropertyValue("--link")).toBe("");
  expect(style.getPropertyValue("--scroll-thumb")).toBe("#445566");
  expect(style.getPropertyValue("--brand-primary")).toBe("#1f5fad");
  applyColors(style, withRole(colors, "dark", "--doc", undefined), true);
  expect(style.getPropertyValue("--doc")).toBe("");
});

test("roles come in the nine groups, one custom property each, and follow a base color, a role or nothing", () => {
  expect(GROUPS.map((g) => g.label)).toEqual(["Window", "Document", "Links and focus", "Selection and find", "Controls", "Warnings", "Code blocks", "Inline code", "Tooltips and scrollbars"]);
  expect(ROLES).toHaveLength(40);
  expect(new Set(ROLES.map((r) => r.key)).size).toBe(40);
  for (const role of ROLES) {
    expect(GROUPS.some((g) => g.key === role.group)).toBe(true);
    if (role.from) expect(role.from === "auto" || (BASES as readonly string[]).includes(role.from) || !!ROLE[role.from]).toBe(true);
    // A role that follows nothing has a fixed default in both themes; one that follows something has none.
    expect(!!role.light && !!role.dark).toBe(!role.from);
  }
});

test("the tag says what a role follows, and Reset what it goes back to", () => {
  expect(roleTag(ROLE["--link"])).toBe("From secondary");
  expect(roleTag(ROLE["--line-strong"])).toBe("From Muted text");
  expect(roleTag(ROLE["--file-markdown"])).toBe("From Checkboxes and sliders");
  expect(roleTag(ROLE["--control-ink"])).toBe("Automatic");
  expect(roleTag(ROLE["--doc"])).toBeUndefined();
  expect(roleResetTip(ROLE["--control"], "light")).toBe("Reset to follow primary");
  expect(roleResetTip(ROLE["--tip-ink"], "dark")).toBe("Reset to follow Sidebar background");
  expect(roleResetTip(ROLE["--find-current-ink"], "light")).toBe("Reset to automatic");
  expect(roleResetTip(ROLE["--doc"], "light")).toBe("Reset to #ffffff");
  expect(roleResetTip(ROLE["--doc"], "dark")).toBe("Reset to #131518");
});

/** The declarations of the first block whose selector starts with `selector`. */
function block(css: string, selector: string) {
  const start = css.indexOf(selector);
  return css.slice(start, css.indexOf("}", start));
}

test("the defaults are the colors styles.css sets, and every role is one of its custom properties", () => {
  const css = readFileSync("src/styles.css", "utf8").replace(/\r\n/g, "\n");
  const light = block(css, ":root,\n.color-scope {");
  const dark = block(css, ':root:has(.app[data-theme="dark"]),\n.color-scope[data-theme="dark"] {');
  for (const key of BASES) expect(light).toContain(`${baseProperty(key)}: ${DEFAULT_BASES[key]};`);
  for (const role of ROLES) {
    expect(light).toMatch(new RegExp(`\\n  ${role.key}: `));
    if (role.light) expect(light).toContain(`${role.key}: ${role.light};`);
    for (const set of SETS) if (role[set]) expect(set === "light" ? light : dark).toContain(`${role.key}: ${role[set]};`);
  }
});
