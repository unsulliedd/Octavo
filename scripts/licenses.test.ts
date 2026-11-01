import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  type CargoMetadata,
  type Entry,
  copyrightLine,
  fontEntries,
  licenseText,
  lockChain,
  lockParents,
  notices,
  npmEntries,
  packageDirOf,
  problems,
  rustEntries,
  sourceLink,
} from "./licenses.ts";

let root: string;
beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "octavo-licenses-"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Writes `files` (path → text) under `root`. */
function write(files: Record<string, string>) {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
}
const pkg = (name: string, extra: object = {}) => JSON.stringify({ name, version: "1.0.0", ...extra });
const entry = (over: Partial<Entry>): Entry => ({ kind: "npm", name: "a", version: "1.0.0", license: "MIT", text: "T", source: "", via: "octavo > a", ...over });

test("a module belongs to the innermost node_modules package, scoped or not", () => {
  expect(packageDirOf("C:/p/node_modules/react/index.js")).toBe("C:/p/node_modules/react");
  expect(packageDirOf("C:\\p\\node_modules\\@milkdown\\core\\lib\\a.js")).toBe("C:/p/node_modules/@milkdown/core");
  expect(packageDirOf("/p/node_modules/a/node_modules/b/x.js?commonjs-proxy")).toBe("/p/node_modules/a/node_modules/b");
});

test("project files, virtual modules and the node_modules folder itself belong to no package", () => {
  for (const id of ["/p/src/App.tsx", "\0vite/preload-helper.js", "/p/node_modules/react", "/p/node_modules/@scope/pkg"]) {
    expect(packageDirOf(id), id).toBeUndefined();
  }
});

test("only the packages with a module or an asset in the bundle get an entry", () => {
  write({
    "package-lock.json": JSON.stringify({
      packages: {
        "": { dependencies: { used: "1", fonts: "1" } },
        "node_modules/used": { dependencies: { inner: "1" } },
        "node_modules/inner": {},
        "node_modules/fonts": {},
        "node_modules/devtool": {},
      },
    }),
    "node_modules/used/package.json": pkg("used", { license: "MIT" }),
    "node_modules/used/LICENSE": "MIT used\r\n",
    "node_modules/inner/package.json": pkg("inner", { license: "ISC" }),
    "node_modules/inner/LICENSE.md": "ISC inner",
    "node_modules/fonts/package.json": pkg("fonts", { license: "MIT" }),
    "node_modules/fonts/LICENSE": "MIT fonts",
    "node_modules/devtool/package.json": pkg("devtool", { license: "GPL-3.0-only" }),
    "node_modules/devtool/LICENSE": "GPL",
  });
  const at = (f: string) => path.join(root, f);
  const entries = npmEntries(root, [at("node_modules/used/index.js"), at("node_modules/used/lib.js"), at("node_modules/inner/i.js"), at("node_modules/fonts/a.woff2"), at("src/App.tsx")]);
  expect(entries.map((e) => [e.name, e.license, e.text, e.via]).sort()).toEqual([
    ["fonts", "MIT", "MIT fonts", "octavo > fonts"],
    ["inner", "ISC", "ISC inner", "octavo > used > inner"],
    ["used", "MIT", "MIT used", "octavo > used"],
  ]);
});

test("the chain to a nested package follows the lockfile's node_modules resolution", () => {
  const lock = {
    packages: {
      "": { dependencies: { a: "1" } },
      "node_modules/a": { dependencies: { b: "1", c: "1" } },
      "node_modules/a/node_modules/b": { dependencies: { c: "1" } },
      "node_modules/c": {},
    },
  };
  const parents = lockParents(lock);
  expect(lockChain(parents, "node_modules/a/node_modules/b")).toBe("octavo > a > b");
  expect(lockChain(parents, "node_modules/c")).toBe("octavo > a > c");
});

test("license files in a package are joined, with their names when there are several; none gives an empty text", () => {
  write({
    "multi/LICENSE-MIT": "MIT text",
    "multi/LICENSE-APACHE": "Apache text",
    "multi/NOTICE": "Notice text",
    "multi/licenses.js": "not a license",
    "single/COPYING": "\uFEFFcopying\r\n",
    "none/index.js": "",
  });
  expect(licenseText(path.join(root, "multi"))).toBe("LICENSE-APACHE\n\nApache text\n\n\nLICENSE-MIT\n\nMIT text\n\n\nNOTICE\n\nNotice text");
  expect(licenseText(path.join(root, "single"))).toBe("copying");
  expect(licenseText(path.join(root, "none"))).toBe("");
});

test("without a license file the readme's copyright line stands in, then the author", () => {
  write({
    "readme-pkg/README.md": "# Title\n\n> Copyright (c) 2020 Someone\n",
    "author-pkg/README.md": "# Title\n",
    "bare/index.js": "",
  });
  expect(copyrightLine(path.join(root, "readme-pkg"), ["X"])).toBe("Copyright (c) 2020 Someone");
  expect(copyrightLine(path.join(root, "author-pkg"), ["X <x@y>"])).toBe("No license file is included. Author: X <x@y>.");
  expect(copyrightLine(path.join(root, "bare"), [])).toBe("No license file or copyright line is included.");
});

test("the copyright line search handles a huge readme without blanks or a match", () => {
  write({ "huge/README.md": " \t".repeat(200_000) + "\n" + "-".repeat(200_000) });
  expect(copyrightLine(path.join(root, "huge"), [])).toBe("No license file or copyright line is included.");
});

test("the Rust crates are the normal dependencies of the app, not build or test ones, and not the app itself", () => {
  const id = (n: string) => `registry#${n}@1.0.0`;
  const node = (n: string, deps: [string, (string | null)[]][]) => ({
    id: id(n),
    deps: deps.map(([d, kinds]) => ({ pkg: id(d), dep_kinds: kinds.map((kind) => ({ kind })) })),
  });
  write({ "crates/dep/LICENSE": "dep text", "crates/deep/LICENSE": "deep text", "crates/other/LICENSE": "x" });
  const p = (n: string, license: string | null) => ({
    id: id(n),
    name: n,
    version: "1.0.0",
    license,
    license_file: null,
    repository: null,
    authors: [],
    manifest_path: path.join(root, "crates", n, "Cargo.toml"),
  });
  const meta: CargoMetadata = {
    packages: [p("app", "MIT"), p("dep", "MIT OR Apache-2.0"), p("deep", null), p("buildonly", "MIT"), p("testonly", "MIT")],
    resolve: {
      root: id("app"),
      nodes: [
        node("app", [["dep", [null]], ["buildonly", ["build"]], ["testonly", ["dev"]]]),
        node("dep", [["deep", [null, "build"]]]),
        node("deep", []),
        node("buildonly", []),
        node("testonly", []),
      ],
    },
  };
  expect(rustEntries(meta).map((e) => [e.name, e.license, e.text, e.via])).toEqual([
    ["dep", "MIT OR Apache-2.0", "dep text", "app > dep"],
    ["deep", "", "deep text", "app > dep > deep"],
  ]);
});

test("a shipped package with no license, or one off the allow list, is a problem", () => {
  const list = [
    entry({ name: "fine", license: "MIT OR GPL-3.0-only" }),
    entry({ name: "copyleft", license: "MPL-2.0" }),
    entry({ name: "mixed", license: "MIT AND LGPL-2.1-only" }),
    entry({ name: "blank", license: "" }),
  ];
  expect(problems(list).map((p) => [p.entry.name, p.reason])).toEqual([
    ["copyleft", "MPL-2.0 (not allowed: MPL-2.0)"],
    ["mixed", "MIT AND LGPL-2.1-only (not allowed: LGPL-2.1-only)"],
    ["blank", "declares no license"],
  ]);
});

test("an undeclared license is filled in only for a package that declares none", () => {
  write({
    "node_modules/khroma/package.json": pkg("khroma"),
    "node_modules/khroma/license": "MIT khroma",
    "other/node_modules/khroma/package.json": pkg("khroma", { license: "GPL-3.0-only" }),
    "unknown/node_modules/nolicense/package.json": pkg("nolicense"),
  });
  const lock = JSON.stringify({ packages: { "": {} } });
  write({ "package-lock.json": lock, "other/package-lock.json": lock, "unknown/package-lock.json": lock });
  const license = (dir: string, file: string) => npmEntries(path.join(root, dir), [path.join(root, dir, file)])[0].license;
  expect(license(".", "node_modules/khroma/a.js")).toBe("MIT");
  expect(license("other", "node_modules/khroma/a.js")).toBe("GPL-3.0-only");
  expect(license("unknown", "node_modules/nolicense/a.js")).toBe("");
});

test("the document groups packages that share a license text and keeps the kinds apart", () => {
  const md = notices([
    entry({ name: "b", text: "MIT text" }),
    entry({ name: "a", text: "MIT text" }),
    entry({ name: "c", license: "ISC", text: "ISC text" }),
    entry({ kind: "rust", name: "r", version: "2.0.0", text: "MIT text" }),
  ]);
  expect(md).toContain("## Frontend packages (3)");
  expect(md).toContain("## Rust crates (1)");
  expect(md).toContain("### a 1.0.0 and 1 more\n\n- `a` 1.0.0, MIT\n- `b` 1.0.0, MIT\n\n```text\nMIT text\n```");
  expect(md).toContain("### c 1.0.0\n\n- `c` 1.0.0, ISC");
  expect(md).toContain("### r 2.0.0\n\n- `r` 2.0.0, MIT");
});

test("a license text with code fences in it cannot close the document's fence", () => {
  const md = notices([entry({ text: "before\n````\nafter" })]);
  expect(md).toContain("`````text\nbefore\n````\nafter\n`````");
});

test("the KaTeX fonts get an entry of their own only when a font file is in the bundle", () => {
  write({ "node_modules/katex/package.json": pkg("katex", { version: "0.19.0" }) });
  expect(fontEntries(root, [path.join(root, "node_modules/katex/dist/katex.mjs")])).toEqual([]);
  const [fonts] = fontEntries(root, [path.join(root, "node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2")]);
  expect(fonts).toMatchObject({ kind: "font", name: "KaTeX fonts", version: "0.19.0", license: "OFL-1.1" });
  expect(fonts.text).toContain("Khan Academy");
  expect(fonts.text).toContain("SIL OPEN FONT LICENSE Version 1.1");
});

test("a named exception allows its package with exactly its license, and only with a source link", () => {
  const ok = entry({ name: "elkjs", license: "EPL-2.0", source: "https://github.com/kieler/elkjs" });
  expect(problems([ok])).toEqual([]);
  expect(problems([{ ...ok, source: "" }]).map((p) => p.reason)).toEqual(["EPL-2.0 is allowed for this package only with a source link, and it has none"]);
  expect(problems([{ ...ok, license: "EPL-2.0 OR GPL-3.0-only" }])).toHaveLength(1);
  expect(problems([{ ...ok, license: "MPL-2.0" }])).toHaveLength(1);
  expect(problems([{ ...ok, name: "other" }])).toHaveLength(1);
  expect(problems([entry({ name: "cssparser", license: "MPL-2.0", source: "https://x.y/z" })])).toEqual([]);
});

test("repository fields become web addresses, and the document links them", () => {
  expect(sourceLink("git+https://github.com/a/b.git")).toBe("https://github.com/a/b");
  expect(sourceLink("git://github.com/a/b.git")).toBe("https://github.com/a/b");
  expect(sourceLink("git@github.com:a/b.git")).toBe("https://github.com/a/b");
  expect(sourceLink("github:a/b")).toBe("https://github.com/a/b");
  expect(sourceLink("a/b")).toBe("https://github.com/a/b");
  expect(sourceLink("https://gitlab.com/a/b")).toBe("https://gitlab.com/a/b");
  expect(sourceLink(undefined)).toBe("");
  expect(sourceLink("file:///x")).toBe("");
  expect(notices([entry({ source: "https://github.com/a/b" })])).toContain("- `a` 1.0.0, MIT, [source](https://github.com/a/b)");
});
