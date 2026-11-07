// Quick open search: the documents of the open workspace that match a search, as many as are drawn, with the matching
// parts of each path marked.

import { filterDocuments, queryWords, type WorkspaceDoc } from "./workspaces";

/** How many results are drawn; the rest are counted. */
export const QUICK_LIMIT = 50;

/** A run of a relative path: whether the search matched it and whether it is the file name rather than its folders. */
export type PathPart = { text: string; match: boolean; name: boolean };
export type QuickItem = { doc: WorkspaceDoc; parts: PathPart[] };

/** `relative` in runs, marking where any of `words` (lower case) occurs. */
export function pathParts(relative: string, words: string[]): PathPart[] {
  const lower = relative.toLowerCase();
  const marked = new Array<boolean>(relative.length).fill(false);
  // Lower-casing can change a text's length; then positions don't line up and nothing is marked.
  if (lower.length === relative.length) {
    for (const word of words) for (let at = lower.indexOf(word); at >= 0; at = lower.indexOf(word, at + 1)) marked.fill(true, at, at + word.length);
  }
  const nameAt = relative.lastIndexOf("/") + 1;
  const parts: PathPart[] = [];
  for (let i = 0; i < relative.length; i++) {
    const last = parts[parts.length - 1];
    const name = i >= nameAt;
    if (last && last.match === marked[i] && last.name === name) last.text += relative[i];
    else parts.push({ text: relative[i], match: marked[i], name });
  }
  return parts;
}

/** The first `limit` documents matching `query` (all of them for an empty query), and how many more there are. */
export function quickResults(docs: WorkspaceDoc[], query: string, limit = QUICK_LIMIT) {
  const found = filterDocuments(docs, query);
  const words = queryWords(query);
  const items: QuickItem[] = found.slice(0, limit).map((doc) => ({ doc, parts: pathParts(doc.relative, words) }));
  return { items, more: found.length - items.length };
}

/** The result number after pressing Up (-1) or Down (1) from `current` among `count`, stopping at either end. */
export const moveActive = (count: number, current: number, by: -1 | 1) => Math.max(0, Math.min(count - 1, current + by));
