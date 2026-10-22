// Runs from `npm version <patch|minor|x.y.z>` (package.json's "version" script), after npm bumps
// package.json and before it commits and tags v<x.y.z>. Copies the version into the Rust crate and
// turns CHANGELOG's Unreleased section into this release. tauri.conf.json reads package.json itself.
import { readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));

function edit(file, pattern, replacement) {
  const text = readFileSync(file, "utf8");
  if (!pattern.test(text)) throw new Error(`${file}: no match for ${pattern}`);
  writeFileSync(file, text.replace(pattern, replacement));
}

edit("src-tauri/Cargo.toml", /^version = "[^"]*"/m, `version = "${version}"`);
edit("src-tauri/Cargo.lock", /(name = "octavo"\r?\nversion = ")[^"]*"/, `$1${version}"`);

const changelog = readFileSync("CHANGELOG.md", "utf8");
const unreleased = changelog.match(/^## \[Unreleased\]\r?\n([\s\S]*?)(?=^## \[|$(?![\s\S]))/m);
if (!unreleased || !unreleased[1].trim()) throw new Error("CHANGELOG.md: the Unreleased section is empty");
const date = new Date().toISOString().slice(0, 10);
edit("CHANGELOG.md", /^## \[Unreleased\]/m, `## [Unreleased]\n\n## [${version}] - ${date}`);

console.log(`Synced version ${version}`);
