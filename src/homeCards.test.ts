import { expect, test } from "vitest";
import { coverTiles, firstLaunch, homeCards } from "./homeCards";
import { PINNED, type Workspace } from "./workspaces";

const ws = (id: string, extra: Partial<Workspace> = {}): Workspace => ({ id, name: id, items: [], removed: [], ...extra });
const ROLE = /^(var\(--(control|brand-secondary|brand-accent)\)|color-mix\(in srgb, var\(--(control|brand-secondary|brand-accent)\) \d+%, var\(--doc\)\))$/;

test("the same id always draws the same cover, whatever the name", () => {
  expect(coverTiles("w1")).toEqual(coverTiles("w1"));
  expect(coverTiles("lzq8k3abc")).toEqual(coverTiles("lzq8k3abc"));
});

test("different ids draw different covers", () => {
  const ids = ["w1", "w2", "w3", "pinned", "lzq8k3abc", "lzq8k3abd"];
  expect(new Set(ids.map((id) => JSON.stringify(coverTiles(id)))).size).toBe(ids.length);
});

test("a cover is 4 × 3 tiles drawn only from the theme roles", () => {
  const tiles = coverTiles("anything");
  expect(tiles).toHaveLength(12);
  expect(tiles.map((t) => [t.x, t.y])).toEqual([0, 1, 2].flatMap((y) => [0, 1, 2, 3].map((x) => [x, y])));
  for (const t of tiles) {
    expect(t.background).toMatch(ROLE);
    expect(t.fill).toMatch(ROLE);
    expect([0, 90, 180, 270]).toContain(t.turn);
  }
});

test("covers use all three roles across workspaces", () => {
  const bases = new Set(Array.from({ length: 30 }, (_, i) => coverTiles(`id${i}`)[0].background.match(/--[\w-]+/)![0]));
  expect(bases).toEqual(new Set(["--control", "--brand-secondary", "--brand-accent"]));
});

test("Pinned comes first, then the others in their saved order", () => {
  const list = [ws("a"), ws("b"), PINNED, ws("c")];
  expect(homeCards(list).map((w) => w.id)).toEqual(["pinned", "a", "b", "c"]);
  expect(homeCards([ws("a")]).map((w) => w.id)).toEqual(["pinned", "a"]);
});

test("the first launch has no workspace besides an empty Pinned and no recent document", () => {
  expect(firstLaunch([], [])).toBe(true);
  expect(firstLaunch([PINNED], [])).toBe(true);
  expect(firstLaunch([PINNED], [{ path: "C:/a.md", at: 1 }])).toBe(false);
  expect(firstLaunch([PINNED, ws("a")], [])).toBe(false);
  expect(firstLaunch([{ ...PINNED, items: [{ kind: "folder", path: "C:/f" }] }], [])).toBe(false);
});
