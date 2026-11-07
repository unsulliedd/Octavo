// Third-party notices: the license of everything that ships in the installers, as one Markdown document. The
// frontend packages are the ones the production bundle really contains (the build reports its modules), the Rust
// crates are the normal dependencies of the Windows build, and the KaTeX fonts have a license of their own. The build
// fails when a shipped package has no license or one that is not on the allow list.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { check } from "./spdx.ts";

/** SPDX identifiers that may ship. Anything else, copyleft licenses included, needs a decision before it is added. */
export const ALLOWED = [
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "OFL-1.1",
  "Unicode-3.0",
  "Unlicense",
  "Zlib",
];

/** Exceptions that may follow `WITH`. */
export const EXCEPTIONS = ["LLVM-exception"];

/**
 * Licenses of packages that ship their license file but declare no license in package.json, read from that file. Used
 * only while the package declares none.
 */
export const UNDECLARED: Record<string, string> = { khroma: "MIT" };

/**
 * Packages allowed with a license that is not on the list, each only with exactly this license. They must have a
 * source link, which the document shows.
 */
export const EXCEPTIONS_BY_PACKAGE: Record<string, string> = {
  elkjs: "EPL-2.0",
  "option-ext": "MPL-2.0",
  cssparser: "MPL-2.0",
  "cssparser-macros": "MPL-2.0",
  selectors: "MPL-2.0",
  "dtoa-short": "MPL-2.0",
};

export const WINDOWS_TARGET = "x86_64-pc-windows-msvc";

/** Where the build writes the document, next to the frontend's other files. */
export const NOTICES_FILE = "third-party-licenses.md";

export type Entry = {
  kind: "npm" | "rust" | "font";
  name: string;
  version: string;
  /** SPDX expression; empty when the package declares none. */
  license: string;
  /** The package's license files, or its copyright line when it has none. */
  text: string;
  /** Where the source is, as a web address; empty when the package names none. */
  source: string;
  /** How the project depends on it, for the build's error message. */
  via: string;
};

const normalize = (text: string) => text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();

/** A repository field as a web address: no git+ prefix or .git suffix, ssh and git forms as https, "github:" and "user/repo" shorthands. */
export function sourceLink(repo: string | undefined): string {
  let r = (repo ?? "").trim().replace(/^git\+/, "").replace(/\.git$/, "");
  r = r.replace(/^git:\/\//, "https://").replace(/^(?:ssh:\/\/)?git@([^:/]+)[:/]/, "https://$1/");
  if (/^(?:github:)?[\w.-]+\/[\w.-]+$/.test(r)) r = "https://github.com/" + r.replace(/^github:/, "");
  return /^https?:\/\//.test(r) ? r : "";
}
const slashes = (p: string) => p.replace(/\\/g, "/");

// ---------------------------------------------------------------------------------------------------------------------
// License files

const LICENSE_FILE = /^(licen[sc]es?|copying|notice|unlicen[sc]e)(?:[-._].*)?$/i;
const NOT_TEXT = /\.(?:[cm]?[jt]s|json|map|d\.ts)$/i;

/** The license files in the top folder of a package (LICENSE, LICENSE-MIT, COPYING, NOTICE …), joined; empty if none. */
export function licenseText(dir: string, extra: string[] = []): string {
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile() && LICENSE_FILE.test(f.name) && !NOT_TEXT.test(f.name))
    .map((f) => f.name);
  for (const e of extra) if (!names.includes(e)) names.push(e);
  names.sort();
  const texts = names.map((n) => normalize(readFileSync(path.join(dir, n), "utf8"))).filter(Boolean);
  if (texts.length < 2) return texts[0] ?? "";
  return texts.map((t, i) => `${names[i]}\n\n${t}`).join("\n\n\n");
}

/** The first copyright line of the package's readme, else its author; for packages that ship no license file. */
export function copyrightLine(dir: string, authors: string[]): string {
  const readme = readdirSync(dir).find((n) => /^readme(?:\.|$)/i.test(n));
  if (readme) {
    const line = readFileSync(path.join(dir, readme), "utf8")
      .split("\n")
      .find((l) => /^[ \t>*_#-]*copyright\b/i.test(l));
    if (line) return line.replace(/^[ \t>*_#-]+/, "").trim();
  }
  return authors.length ? `No license file is included. Author: ${authors.join(", ")}.` : "No license file or copyright line is included.";
}

// ---------------------------------------------------------------------------------------------------------------------
// npm packages

/** The package folder a bundled module belongs to (the innermost `node_modules/<name>`), or undefined for project files. */
export function packageDirOf(id: string): string | undefined {
  const clean = slashes(id.split("?")[0]);
  const marker = "/node_modules/";
  const at = clean.lastIndexOf(marker);
  if (at < 0) return undefined;
  const parts = clean.slice(at + marker.length).split("/");
  const n = parts[0].startsWith("@") ? 2 : 1;
  if (parts.length <= n) return undefined;
  return clean.slice(0, at + marker.length) + parts.slice(0, n).join("/");
}

type Manifest = {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: ({ type?: string } | string)[];
  author?: string | { name?: string };
  repository?: string | { url?: string };
};

function declaredLicense(pkg: Manifest): string {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => (typeof l === "string" ? l : (l.type ?? ""))).join(" OR ");
  return "";
}

/** The entry for the npm package in `dir`; `via` says how the project depends on it. */
export function npmEntry(dir: string, via: string): Entry {
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Manifest;
  const author = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
  const name = pkg.name ?? path.basename(dir);
  return {
    kind: "npm",
    name,
    version: pkg.version ?? "",
    license: declaredLicense(pkg) || (UNDECLARED[name] ?? ""),
    text: licenseText(dir) || copyrightLine(dir, author ? [author] : []),
    source: sourceLink(typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url),
    via,
  };
}

type Lock = { packages: Record<string, { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }> };

/** For each installed package in the lockfile, the package it was first reached from, starting at the project's own dependencies. */
export function lockParents(lock: Lock): Map<string, string> {
  const parents = new Map<string, string>([["", ""]]);
  const queue = [""];
  for (const from of queue) {
    const p = lock.packages[from];
    for (const name of Object.keys({ ...p?.dependencies, ...p?.optionalDependencies })) {
      // Node looks in the package's own node_modules first, then in each folder above it.
      let base = from;
      let key: string | undefined;
      for (;;) {
        const candidate = `${base ? base + "/" : ""}node_modules/${name}`;
        if (lock.packages[candidate]) {
          key = candidate;
          break;
        }
        const up = base.lastIndexOf("/node_modules/");
        if (!base) break;
        base = up < 0 ? "" : base.slice(0, up);
      }
      if (key && !parents.has(key)) {
        parents.set(key, from);
        queue.push(key);
      }
    }
  }
  return parents;
}

const lockName = (key: string) => key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);

/** `octavo > mermaid > dagre-d3-es` for the lockfile entry `key`. */
export function lockChain(parents: Map<string, string>, key: string): string {
  const names: string[] = [];
  for (let k: string | undefined = key; k; k = parents.get(k)) names.unshift(lockName(k));
  return ["octavo", ...names].join(" > ");
}

/** Entries for the npm packages that have a module or an asset in the bundle. */
export function npmEntries(root: string, files: Iterable<string>): Entry[] {
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8")) as Lock;
  const parents = lockParents(lock);
  const dirs = new Set<string>();
  for (const f of files) {
    const dir = packageDirOf(f);
    if (dir) dirs.add(dir);
  }
  return [...dirs].map((dir) => {
    const key = slashes(path.relative(root, dir));
    return npmEntry(dir, parents.has(key) ? lockChain(parents, key) : key);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Rust crates

type CargoPackage = {
  id: string;
  name: string;
  version: string;
  license: string | null;
  license_file: string | null;
  repository: string | null;
  authors: string[];
  manifest_path: string;
};
export type CargoMetadata = {
  packages: CargoPackage[];
  resolve: { root: string | null; nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[] };
};

/** `cargo metadata` for the Windows build, from the lockfile. */
export function cargoMetadata(cwd: string): CargoMetadata {
  try {
    const out = execFileSync("cargo", ["metadata", "--locked", "--format-version", "1", "--filter-platform", WINDOWS_TARGET], {
      cwd,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out) as CargoMetadata;
  } catch (e) {
    throw new Error(`cargo metadata failed in ${cwd}: ${(e as { stderr?: string }).stderr || String(e)}`);
  }
}

/** The crates linked into the program: the app's normal dependencies, not build scripts or tests, and the app itself left out. */
export function rustEntries(meta: CargoMetadata): Entry[] {
  const packages = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const root = meta.resolve.root;
  if (!root || !nodes.has(root)) throw new Error("cargo metadata has no root package");
  const parents = new Map<string, string>([[root, ""]]);
  const queue = [root];
  for (const id of queue)
    for (const d of nodes.get(id)?.deps ?? [])
      if (d.dep_kinds.some((k) => k.kind === null) && !parents.has(d.pkg)) {
        parents.set(d.pkg, id);
        queue.push(d.pkg);
      }
  return queue.slice(1).map((id) => {
    const p = packages.get(id)!;
    const dir = path.dirname(p.manifest_path);
    const chain: string[] = [];
    for (let k: string | undefined = id; k; k = parents.get(k)) chain.unshift(packages.get(k)?.name ?? k);
    return {
      kind: "rust",
      name: p.name,
      version: p.version,
      license: p.license ?? "",
      text: licenseText(dir, p.license_file ? [p.license_file] : []) || copyrightLine(dir, p.authors),
      source: sourceLink(p.repository ?? undefined),
      via: chain.join(" > "),
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Fonts

const KATEX_FONT = /KaTeX_[\w-]+\.(?:woff2?|ttf)$/;

/** The KaTeX fonts are under the SIL Open Font License, not the MIT license of the package that carries them. */
export function fontEntries(root: string, files: Iterable<string>): Entry[] {
  if (![...files].some((f) => KATEX_FONT.test(f))) return [];
  const version = (JSON.parse(readFileSync(path.join(root, "node_modules/katex/package.json"), "utf8")) as Manifest).version ?? "";
  const copyright = [
    "Copyright (c) 2009-2010, Design Science, Inc. (<www.mathjax.org>)",
    "Copyright (c) 2014-2018 Khan Academy (<www.khanacademy.org>),",
    "with Reserved Font Names KaTeX_AMS, KaTeX_Caligraphic, KaTeX_Fraktur, KaTeX_Main, KaTeX_Math, KaTeX_SansSerif,",
    "KaTeX_Script, KaTeX_Size1, KaTeX_Size2, KaTeX_Size3, KaTeX_Size4 and KaTeX_Typewriter.",
  ].join("\n");
  const ofl = normalize(readFileSync(new URL("./licenses/OFL-1.1.txt", import.meta.url), "utf8"));
  return [{ kind: "font", name: "KaTeX fonts", version, license: "OFL-1.1", text: `${copyright}\n\n${ofl}`, source: "https://github.com/KaTeX/KaTeX", via: "octavo > katex" }];
}

// ---------------------------------------------------------------------------------------------------------------------
// Check and document

/** The entries whose license is missing or not allowed, each with what stands in the way. */
export function problems(entries: Entry[]): { entry: Entry; reason: string }[] {
  const found: { entry: Entry; reason: string }[] = [];
  for (const entry of entries) {
    if (!entry.license) found.push({ entry, reason: "declares no license" });
    else if (EXCEPTIONS_BY_PACKAGE[entry.name] === entry.license) {
      if (!entry.source) found.push({ entry, reason: `${entry.license} is allowed for this package only with a source link, and it has none` });
    } else {
      const verdict = check(entry.license, ALLOWED, EXCEPTIONS);
      if (!verdict.ok) found.push({ entry, reason: `${entry.license} (not allowed: ${verdict.rejected.join(", ")})` });
    }
  }
  return found;
}

export function describe(found: { entry: Entry; reason: string }[]): string {
  const lines = found.map(({ entry, reason }) => `  ${entry.name} ${entry.version}: ${reason}\n    brought in by ${entry.via}`);
  return `Shipped packages with a license that is missing or not on the allow list in scripts/licenses.ts:\n${lines.join("\n")}`;
}

/** A code fence long enough that the text can't close it. */
function fenced(text: string): string {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

const SECTIONS = [
  ["npm", "Frontend packages"],
  ["rust", "Rust crates"],
  ["font", "Fonts"],
] as const;

const byName = (a: Entry, b: Entry) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : a.version > b.version ? 1 : 0);

/** The document: per kind of component, the entries that share a license text grouped under one copy of it. */
export function notices(entries: Entry[]): string {
  const out = [
    "# Open-source licenses",
    "Octavo includes the open-source software below. Each notice lists the packages it applies to, with their licenses.",
  ];
  for (const [kind, title] of SECTIONS) {
    const list = entries.filter((e) => e.kind === kind).sort(byName);
    if (!list.length) continue;
    out.push(`## ${title} (${list.length})`);
    const groups = new Map<string, Entry[]>();
    for (const e of list) groups.set(e.text, [...(groups.get(e.text) ?? []), e]);
    for (const [text, members] of groups) {
      const first = members[0];
      const rest = members.length > 1 ? ` and ${members.length - 1} more` : "";
      out.push(`### ${first.name} ${first.version}${rest}`);
      out.push(members.map((m) => `- \`${m.name}\` ${m.version}, ${m.license}${m.source ? `, [source](${m.source})` : ""}`).join("\n"));
      out.push(fenced(text));
    }
  }
  return out.join("\n\n") + "\n";
}

// ---------------------------------------------------------------------------------------------------------------------
// Build

type Seen = { modules: Set<string>; assets: Set<string> };

/**
 * Vite plugins that collect what the production build contains and write the notices document into the output. One
 * goes in `plugins`, the other in `worker.plugins`, since the render worker is bundled on its own.
 */
export function licensesPlugins(): { main: Plugin; worker: Plugin } {
  const seen: Seen = { modules: new Set(), assets: new Set() };
  let root = process.cwd();
  const collect = (emit: boolean): Plugin => ({
    name: emit ? "octavo-licenses" : "octavo-licenses-worker",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    // Stylesheets from packages never show up among a chunk's modules.
    transform(_code, id) {
      if (/\/node_modules\//.test(slashes(id)) && /\.css(?:\?|$)/.test(id)) seen.modules.add(id);
    },
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const item of Object.values(bundle)) {
          if (item.type === "chunk") {
            for (const [id, m] of Object.entries(item.modules)) if (m.renderedLength > 0) seen.modules.add(id);
          } else for (const f of item.originalFileNames ?? []) seen.assets.add(path.resolve(root, f));
        }
        if (!emit) return;
        const files = [...seen.modules, ...seen.assets];
        const entries = [
          ...npmEntries(root, files),
          ...rustEntries(cargoMetadata(path.join(root, "src-tauri"))),
          ...fontEntries(root, files),
        ];
        const found = problems(entries);
        if (found.length) this.error(describe(found));
        this.emitFile({ type: "asset", fileName: NOTICES_FILE, source: notices(entries) });
      },
    },
  });
  return { main: collect(true), worker: collect(false) };
}
