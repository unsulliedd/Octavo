import { expect, test } from "vitest";
import { ROLE, ROLES } from "./colors";
import { contrast, contrastWarnings, luminance, PAIRS } from "./contrast";

test("luminance and contrast follow WCAG", () => {
  expect(luminance("#000000")).toBe(0);
  expect(luminance("#ffffff")).toBeCloseTo(1, 10);
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 10);
  expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 10);
  expect(contrast("#777777", "#777777")).toBe(1);
  // Known pairs: #767676 is the lightest gray with 4.5:1 on white.
  expect(contrast("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  expect(contrast("#6fa8d6", "#fffdf8")).toBeCloseTo(2.5, 1);
  expect(contrast("#1b1f24", "#ffffff")).toBeCloseTo(16.56, 2);
});

test("every pair is two roles, text needs 4.5:1 and marks 3:1", () => {
  for (const { fg, bg, min } of PAIRS) {
    expect(ROLE[fg], fg).toBeDefined();
    expect(ROLE[bg], bg).toBeDefined();
    expect([3, 4.5]).toContain(min);
  }
  const has = (fg: string, bg: string, min: number) => expect(PAIRS).toContainEqual({ fg, bg, min });
  has("--ink", "--doc", 4.5);
  has("--muted", "--doc", 4.5);
  has("--link", "--doc", 4.5);
  has("--control-ink", "--control-fill", 4.5);
  has("--find-current-ink", "--find-current", 4.5);
  has("--code-inline-ink", "--code-inline-bg", 4.5);
  has("--tip-ink", "--tip", 4.5);
  for (const fg of ["--code-kw", "--code-str", "--code-num", "--code-com", "--code-fn", "--code-type", "--code-attr"]) has(fg, "--code-bg", 4.5);
  has("--control", "--doc", 3);
});

/** The light defaults as they resolve, for the roles the pairs use. */
const LIGHT: Record<string, string> = {
  ...Object.fromEntries(ROLES.filter((r) => r.light).map((r) => [r.key, r.light!])),
  "--line-strong": "#81888f",
  "--outline-mark": "#57606a",
  "--link": "#2f6c9f",
  "--focus": "#2f6c9f",
  "--select": "#cfe6f6",
  "--find-match": "#eedab6",
  "--find-current": "#d39d3f",
  "--find-current-ink": "#1b1f24",
  "--control": "#5a0e27",
  "--control-fill": "#5a0e27",
  "--control-ink": "#ffffff",
  "--control-soft": "#f0e9ec",
  "--control-soft-ink": "#5a0e27",
  "--file-markdown": "#5a0e27",
  "--brand-accent-ink": "#98712d",
  "--code-inline-ink": "#745623",
  "--code-inline-bg": "#f6ebd9",
  "--tip": "#1b1f24",
  "--tip-ink": "#f3f4f6",
};

test("the default colors meet every pair", () => {
  for (const { fg, bg, min } of PAIRS) expect(contrast(LIGHT[fg], LIGHT[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
});

test("nothing changed, nothing to warn about", () => {
  expect(contrastWarnings(LIGHT, {})).toEqual({});
});

test("a changed text color under its ratio warns, naming the background it reads worst on", () => {
  const values = { ...LIGHT, "--link": "#6fa8d6", "--doc": "#fffdf8", "--chrome": "#f4f1ea" };
  expect(contrastWarnings(values, { "--link": "#6fa8d6" })).toEqual({ "--link": "Hard to read on Sidebar background (2.2:1)" });
  expect(contrastWarnings({ ...values, "--chrome": "#ffffff" }, { "--link": "#6fa8d6" })).toEqual({ "--link": "Hard to read on Page background (2.5:1)" });
  expect(contrastWarnings({ ...LIGHT, "--link": "#1f4e79" }, { "--link": "#1f4e79" })).toEqual({});
});

test("a changed mark only needs 3:1", () => {
  expect(contrastWarnings({ ...LIGHT, "--control": "#8a8a8a" }, { "--control": "#8a8a8a" })).toEqual({});
  expect(contrastWarnings({ ...LIGHT, "--control": "#bbbbbb" }, { "--control": "#bbbbbb" })).toEqual({ "--control": "Hard to see on Page background (1.9:1)" });
});

test("a changed background warns about the worst text on it the user didn't change", () => {
  expect(contrastWarnings({ ...LIGHT, "--doc": "#202020" }, { "--doc": "#202020" })).toEqual({ "--doc": "Text is hard to read on this (1.0:1)" });
  // Text changed with the background: the background row only names text the user didn't change.
  expect(contrastWarnings({ ...LIGHT, "--doc": "#202020", "--ink": "#eeeeee" }, { "--doc": "#202020", "--ink": "#eeeeee" })["--doc"]).toBe("Muted text is hard to read on this (2.5:1)");
  const code = { ...LIGHT, "--code-bg": "#30353c" };
  expect(contrastWarnings(code, { "--code-bg": "#30353c" })).toEqual({ "--code-bg": "Text is hard to read on this (1.3:1)" });
});

test("when the text was changed too, the warning sits on the text, not the background", () => {
  const values = { ...LIGHT, "--tip": "#eeeeee", "--tip-ink": "#dddddd" };
  expect(contrastWarnings(values, { "--tip": "#eeeeee", "--tip-ink": "#dddddd" })).toEqual({ "--tip-ink": "Hard to read on Tooltip background (1.1:1)" });
});

test("a role that follows a changed role counts as changed: the background isn't blamed for it", () => {
  // Focus ring follows Link; the light link fails on the page through it, which is Link's warning, not the page's.
  const values = { ...LIGHT, "--doc": "#fffdf8", "--chrome": "#ffffff", "--link": "#6fa8d6", "--focus": "#6fa8d6" };
  expect(contrastWarnings(values, { "--doc": "#fffdf8", "--link": "#6fa8d6" })).toEqual({ "--link": "Hard to read on Page background (2.5:1)" });
  // A role that follows a base color is still untouched.
  expect(contrastWarnings({ ...LIGHT, "--doc": "#2f6c9f" }, { "--doc": "#2f6c9f" })["--doc"]).toBe("Link is hard to read on this (1.0:1)");
});

test("a role without a value yet warns about nothing", () => {
  expect(contrastWarnings({ "--link": "#ffffff" }, { "--link": "#ffffff" })).toEqual({});
});
