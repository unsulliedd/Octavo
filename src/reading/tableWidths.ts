// Column widths the reader set by hand, per file and table. Kept by Octavo, never in the Markdown file.

/** Widths in em by column, null for a column left at its automatic width. */
export type Widths = (number | null)[];
/** By file, then by the table's position among the document's tables: its header text and widths. */
export type TableWidths = Record<string, Record<string, { header: string; widths: Widths }>>;

/** Files whose widths are kept; the ones changed longest ago are dropped first. */
export const MAX_FILES = 200;

/** Windows paths ignore case, so a file keeps its widths whichever way its path is written. */
const fileKey = (path: string) => (/^[a-z]:[\\/]|\\/i.test(path) ? path.toLowerCase() : path);

/** Identifies a table by its header cells, so widths saved for a table that changed aren't applied to it. */
export const headerKey = (headers: string[]) => headers.map((h) => h.trim().replace(/\s+/g, " ")).join("\u241f");

/** The saved widths of table `index` in `path`, if its header is still the same. */
export function savedWidths(store: TableWidths, path: string, index: number, headers: string[]): Widths | undefined {
  const saved = store[fileKey(path)]?.[index];
  return saved && saved.header === headerKey(headers) && saved.widths.length === headers.length ? saved.widths : undefined;
}

/**
 * `store` with column `column` of table `index` in `path` set to `width` em, or back to automatic with
 * null. Widths saved for a different header are replaced.
 */
export function withWidth(store: TableWidths, path: string, index: number, headers: string[], column: number, width: number | null) {
  const widths: Widths = [...(savedWidths(store, path, index, headers) ?? headers.map(() => null))];
  widths[column] = width;
  return withWidths(store, path, index, headers, widths);
}

/** `store` with the column widths of table `index` in `path` set to `widths` (null for automatic). */
export function withWidths(store: TableWidths, path: string, index: number, headers: string[], given: Widths) {
  const key = fileKey(path);
  const widths = headers.map((_, i) => (given[i] == null ? null : Math.round(given[i]! * 100) / 100));
  const { [key]: file = {}, ...others } = store;
  const { [index]: _, ...tables } = file;
  const next = widths.some((w) => w !== null) ? { ...tables, [index]: { header: headerKey(headers), widths } } : tables;
  // The file just changed goes last, so the oldest go first.
  const files = Object.keys(next).length ? { ...others, [key]: next } : others;
  const keys = Object.keys(files);
  return keys.length > MAX_FILES ? Object.fromEntries(keys.slice(-MAX_FILES).map((k) => [k, files[k]])) : files;
}
