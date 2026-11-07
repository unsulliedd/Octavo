// Contrast warnings for Settings › Colors: text and marks against the backgrounds they sit on. A warning never
// stops a change.

import { ROLE } from "./colors";

/** The WCAG relative luminance of a `#rrggbb` color. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two `#rrggbb` colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text needs 4.5:1 on its background; marks such as icons, checkboxes, borders and the focus ring need 3:1. */
const TEXT = 4.5;
const MARK = 3;

/** Each role drawn on top (`fg`), the background it sits on (`bg`), and the ratio it needs. */
export const PAIRS: readonly { fg: string; bg: string; min: number }[] = [
  ...["--doc", "--chrome", "--chrome-2", "--select", "--find-match", "--code-bg"].map((bg) => ({ fg: "--ink", bg, min: TEXT })),
  ...["--doc", "--chrome"].map((bg) => ({ fg: "--muted", bg, min: TEXT })),
  ...["--doc", "--chrome"].map((bg) => ({ fg: "--link", bg, min: TEXT })),
  { fg: "--danger", bg: "--doc", min: TEXT },
  { fg: "--control-ink", bg: "--control-fill", min: TEXT },
  { fg: "--control-soft-ink", bg: "--control-soft", min: TEXT },
  { fg: "--find-current-ink", bg: "--find-current", min: TEXT },
  { fg: "--code-inline-ink", bg: "--code-inline-bg", min: TEXT },
  { fg: "--tip-ink", bg: "--tip", min: TEXT },
  ...["--code-kw", "--code-str", "--code-num", "--code-com", "--code-fn", "--code-type", "--code-attr"].map((fg) => ({ fg, bg: "--code-bg", min: TEXT })),
  { fg: "--control", bg: "--doc", min: MARK },
  { fg: "--focus", bg: "--doc", min: MARK },
  { fg: "--line-strong", bg: "--doc", min: MARK },
  { fg: "--outline-mark", bg: "--doc", min: MARK },
  { fg: "--file-markdown", bg: "--chrome", min: MARK },
  ...["--doc", "--chrome"].map((bg) => ({ fg: "--brand-accent-ink", bg, min: MARK })),
];

/** A ratio as the warning shows it, rounded down so a pair just under the bound never reads as meeting it. */
const ratio = (r: number) => `${(Math.floor(r * 10) / 10).toFixed(1)}:1`;

/**
 * The warnings of the changed roles, by role. `values` holds every role's color in the set being edited, `changed`
 * the roles the user set. A changed role on top warns about its worst background; a changed background warns about
 * the worst role on it that the user didn't change, by itself or through a role it follows. Text that fails comes
 * before marks that fail.
 */
export function contrastWarnings(values: Record<string, string | undefined>, changed: Record<string, string>): Record<string, string> {
  const warnings: Record<string, string> = {};
  // Whether the user set `key`, or a role that `key` follows.
  const touched = (key: string): boolean => {
    if (changed[key]) return true;
    const from = ROLE[key]?.from;
    return !!from && !!ROLE[from] && touched(from);
  };
  const failing = PAIRS.flatMap((pair) => {
    const fg = values[pair.fg];
    const bg = values[pair.bg];
    if (!fg || !bg) return [];
    const r = contrast(fg, bg);
    return r < pair.min ? [{ ...pair, r }] : [];
  }).sort((a, b) => b.min - a.min || a.r - b.r); // text before marks, each worst first
  for (const { fg, bg, min, r } of failing) {
    if (changed[fg]) warnings[fg] ??= `Hard to ${min === TEXT ? "read" : "see"} on ${ROLE[bg].label} (${ratio(r)})`;
    else if (changed[bg] && !touched(fg)) warnings[bg] ??= `${ROLE[fg].label} is hard to ${min === TEXT ? "read" : "see"} on this (${ratio(r)})`;
  }
  return warnings;
}
