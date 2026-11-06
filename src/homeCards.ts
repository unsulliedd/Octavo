// What Home shows: the order of the workspace cards, whether it is the first launch, and each card's default cover.

import { PINNED, type Workspace } from "./workspaces";
import type { RecentFile } from "./storage";

/** The cards after the + card: Pinned, then the other workspaces in their saved order. */
export const homeCards = (workspaces: Workspace[]) => [workspaces.find((w) => w.id === PINNED.id) ?? PINNED, ...workspaces.filter((w) => w.id !== PINNED.id)];

/** Whether Home has nothing to show yet: no workspace besides an empty Pinned, and no recent document. */
export const firstLaunch = (workspaces: Workspace[], recent: RecentFile[]) => !recent.length && workspaces.every((w) => w.id === PINNED.id && !w.items.length);

/** The three theme roles a cover draws from, so that the cover follows the theme. */
const ROLES = ["var(--control)", "var(--brand-secondary)", "var(--brand-accent)"];
const tint = (role: string, percent: number) => `color-mix(in srgb, ${role} ${percent}%, var(--doc))`;
/** The shapes of a tile, in a 1 × 1 box: a quarter circle, a half circle, a dot, a triangle and nothing. */
const SHAPES = ["M0 0H1A1 1 0 0 1 0 1Z", "M0 1A.5 .5 0 0 1 1 1Z", "M.15 .5A.35 .35 0 1 0 .85 .5A.35 .35 0 1 0 .15 .5Z", "M0 0H1L0 1Z", ""];

/** One square of a cover: at column `x` and row `y`, a `shape` turned by `turn` degrees in `fill` on `background`. */
export type Tile = { x: number; y: number; background: string; shape: string; turn: number; fill: string };

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

/**
 * The default cover of the workspace `id`: 4 × 3 tiles, drawn from primary, secondary and accent mixed with the page
 * colour. The same id always gives the same cover, so a rename keeps it.
 */
export function coverTiles(id: string): Tile[] {
  const h = hash(id);
  let x = h || 1;
  const next = () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
  const base = ROLES[h % 3];
  const other = ROLES[(h % 3 + 1 + ((h >>> 4) % 2)) % 3];
  const fills = [base, other, tint(other, 45)];
  const pick = <T,>(list: T[]) => list[Math.floor(next() * list.length)];
  const tiles: Tile[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 4; col++)
      tiles.push({ x: col, y: row, background: tint(base, (col + row) % 2 ? 22 : 12), shape: pick(SHAPES), turn: 90 * Math.floor(next() * 4), fill: pick(fills) });
  return tiles;
}
