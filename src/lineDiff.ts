// Line diff between two versions of a document, for comparing the file on disk with unsaved edits.

export type DiffLine = { kind: "same" | "del" | "add"; text: string };
/** A diff with long runs of unchanged lines folded into `skip` entries. */
export type DiffView = (DiffLine | { kind: "skip"; count: number })[];

/** Above this many changed lines, the changed middle is shown as removed and added as a whole. */
const MAX_EDITS = 4000;

export const splitLines = (text: string) => text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");

/** The lines of `a` and `b` as unchanged, removed (only in `a`) and added (only in `b`), in order. */
export function diffLines(a: string[], b: string[]): DiffLine[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const same = (lines: string[]): DiffLine[] => lines.map((text) => ({ kind: "same", text }));
  return [...same(a.slice(0, start)), ...middle(a.slice(start, endA), b.slice(start, endB)), ...same(a.slice(endA))];
}

/** Myers' shortest edit script for lines that differ at both ends. */
function middle(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const whole = (): DiffLine[] => [...a.map((text) => ({ kind: "del" as const, text })), ...b.map((text) => ({ kind: "add" as const, text }))];
  if (!n || !m) return whole();
  const offset = n + m;
  const v = new Int32Array(2 * offset + 2);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= Math.min(offset, MAX_EDITS) && found < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return whole();
  // Walk back through the saved states to recover the edits.
  const out: DiffLine[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const k = x - y;
    const down = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]);
    const pk = down ? k + 1 : k - 1;
    const px = prev[offset + pk];
    const py = px - pk;
    while (x > px + (down ? 0 : 1) && y > py + (down ? 1 : 0)) out.push({ kind: "same", text: a[--x] }), y--;
    if (down) out.push({ kind: "add", text: b[--y] });
    else out.push({ kind: "del", text: a[--x] });
  }
  while (x > 0 && y > 0) out.push({ kind: "same", text: a[--x] }), y--;
  return out.reverse();
}

/** Folds unchanged runs, keeping `context` lines next to each change. */
export function foldUnchanged(diff: DiffLine[], context = 3): DiffView {
  const keep = diff.map(() => false);
  diff.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(diff.length - 1, i + context); j++) keep[j] = true;
  });
  const view: DiffView = [];
  let skipped = 0;
  diff.forEach((line, i) => {
    if (keep[i]) {
      if (skipped) view.push({ kind: "skip", count: skipped });
      skipped = 0;
      view.push(line);
    } else skipped++;
  });
  if (skipped) view.push({ kind: "skip", count: skipped });
  return view;
}
