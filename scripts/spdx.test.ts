import { expect, test } from "vitest";
import { check } from "./spdx.ts";

const allowed = ["MIT", "Apache-2.0", "Unicode-3.0"];
const ok = (e: string) => check(e, allowed, ["LLVM-exception"]).ok;

test("a single license is allowed when it is on the list, regardless of case", () => {
  expect(ok("MIT")).toBe(true);
  expect(ok("apache-2.0")).toBe(true);
  expect(check("GPL-3.0-only", allowed)).toEqual({ ok: false, rejected: ["GPL-3.0-only"] });
});

test("OR needs one allowed side, AND needs both", () => {
  expect(ok("MPL-2.0 OR Apache-2.0")).toBe(true);
  expect(ok("MPL-2.0 OR GPL-2.0-only")).toBe(false);
  expect(ok("MIT AND Unicode-3.0")).toBe(true);
  expect(ok("MIT AND MPL-2.0")).toBe(false);
  expect(check("MIT AND MPL-2.0", allowed).rejected).toEqual(["MPL-2.0"]);
});

test("AND binds tighter than OR, and parentheses override it", () => {
  expect(ok("MIT OR MPL-2.0 AND GPL-3.0-only")).toBe(true);
  expect(ok("(MIT OR MPL-2.0) AND GPL-3.0-only")).toBe(false);
  expect(ok("(MIT OR Apache-2.0) AND Unicode-3.0")).toBe(true);
});

test("an older slash between licenses means OR", () => {
  expect(ok("MIT/Apache-2.0")).toBe(true);
  expect(ok("Apache-2.0 / MIT")).toBe(true);
  expect(ok("MPL-2.0/MIT")).toBe(true);
  expect(ok("MPL-2.0/GPL-2.0-only")).toBe(false);
});

test("WITH needs an allowed exception as well as an allowed license", () => {
  expect(ok("Apache-2.0 WITH LLVM-exception")).toBe(true);
  expect(ok("Apache-2.0 WITH Classpath-exception-2.0")).toBe(false);
  expect(ok("GPL-2.0-only WITH LLVM-exception")).toBe(false);
});

test("an expression that does not parse, or is empty, is not allowed", () => {
  for (const bad of ["", "MIT OR", "OR MIT", "(MIT", "MIT)", "MIT AND AND MIT", "MIT WITH", "MIT Apache-2.0"]) {
    expect(check(bad, allowed), bad).toEqual({ ok: false, rejected: [bad] });
  }
});

test("a long expression is checked without trouble", () => {
  const long = Array.from({ length: 20_000 }, () => "MIT").join(" OR ");
  expect(ok(long)).toBe(true);
});
