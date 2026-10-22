// What's new: the release notes of a version as a document, opened after an update or from the update popover.

import { LINKS } from "./links";

/**
 * The body of `version`'s section in a Keep a Changelog file (`## [0.5.0] - 2026-10-22` up to the next
 * `## [`), with its release date; undefined when the file has no such section.
 */
export function changelogSection(changelog: string, version: string): { date?: string; body: string } | undefined {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## ["));
  const body = (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
  const date = lines[start].match(/\]\s*-\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  return { date, body };
}

/** The What's new document for `version`: a title, the release date when known, the notes and a link to every release. */
export function notesPage(version: string, notes: string, date?: string): string {
  const parts = [`# What's new in Octavo ${version}`];
  if (date) parts.push(`Released ${date}`);
  parts.push(notes.trim() || "No notes for this release.", `[All releases](${LINKS.releases})`);
  return parts.join("\n\n") + "\n";
}

/** Numeric parts of a version (`v0.5.1` → [0, 5, 1]); anything after them, such as a suffix, is ignored. */
const parts = (v: string) => (v.replace(/^v/, "").match(/^\d+(\.\d+)*/)?.[0] ?? "").split(".").map(Number);

/** Whether `a` is a later version than `b`. */
export function newer(a: string, b: string): boolean {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/**
 * Whether this launch opens What's new: the app was updated since it last ran. A first launch has no
 * previous version and shows nothing.
 */
export const showAfterUpdate = (previous: string | undefined, current: string) => !!previous && newer(current, previous);
