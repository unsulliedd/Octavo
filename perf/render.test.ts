// Render pipeline timing on ~1 MB documents built from fidelity/fixtures/field-guide.md.
// Compares the working tree's src/render.ts with the one at a git ref (BASE, default main):
//   npm run perf:render
//   BASE=v0.5.0 npm run perf:render
// A report, not a pass/fail gate. Timings are Node on this machine, not the app.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, test } from "vitest";
import { render } from "../src/render";

type Render = typeof render;
const root = join(import.meta.dirname, "..");
const baseRef = process.env.BASE ?? "main";
const baseFile = join(root, "src", "render.base.tmp.ts");
const RUNS = 4;

const spec = readFileSync(join(root, "fidelity", "fixtures", "field-guide.md"), "utf8");
const repeat = (extra: string) => {
  const copies = Math.ceil(1_000_000 / (spec.length + extra.length));
  return Array.from({ length: copies }, () => spec + extra).join("\n\n");
};
const documents = {
  "prose": repeat(""),
  "prose + math": repeat("\n\nEnergy: $e=mc^2$, prices $4.99 or $9.99.\n"),
  "prose + HTML": repeat("\n\nLine<br>break and <kbd>Ctrl</kbd>.\n"),
};

async function loadBase(): Promise<Render | undefined> {
  try {
    writeFileSync(baseFile, execFileSync("git", ["show", `${baseRef}:src/render.ts`], { cwd: root, encoding: "utf8" }));
    return (await import(/* @vite-ignore */ baseFile)).render;
  } catch (e) {
    console.warn(`No base to compare with (${baseRef}): ${e}`);
  }
}

const median = (ms: number[]) => {
  const sorted = ms.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Times the pipelines in turn, in alternating order, so machine load and garbage collection affect them alike. */
async function time(pipelines: Render[], md: string) {
  const run = (fn: Render) => fn(md, "/d", (p) => p);
  const html: string[] = [];
  for (const fn of pipelines) html.push(await run(fn)); // warm-up, also loads lazy plugins
  const ms = pipelines.map((): number[] => []);
  for (let i = 0; i < RUNS; i++) {
    const order = [...pipelines.keys()];
    for (const j of i % 2 ? order.reverse() : order) {
      const start = performance.now();
      await run(pipelines[j]);
      ms[j].push(performance.now() - start);
    }
  }
  return pipelines.map((_, j) => ({ html: html[j], median: median(ms[j]) }));
}

afterAll(() => rmSync(baseFile, { force: true }));

test("render timing", { timeout: 600_000 }, async () => {
  const base = await loadBase();
  const rows = [];
  for (const [name, md] of Object.entries(documents)) {
    const [now, before] = await time(base ? [render, base] : [render], md);
    rows.push({
      document: name,
      KB: Math.round(md.length / 1024),
      [`${baseRef} ms`]: before ? Math.round(before.median) : "-",
      "working tree ms": Math.round(now.median),
      change: before ? `${Math.round((now.median / before.median - 1) * 100)}%` : "-",
      "same HTML": before ? before.html === now.html : "-",
    });
  }
  console.table(rows);
});
