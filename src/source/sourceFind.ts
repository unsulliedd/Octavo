// Find and replace in Source mode: each line is searched on its own, matches are painted as decorations, and
// replacements are one transaction, one undo step.

import { isolateHistory } from "@codemirror/commands";
import { StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { findInBlocks, type FindTarget, type Found, type Query } from "@/reading/find";

export type SourceFound = Found & { to: number };

/** The matches of `query` in `doc`, at most `limit`; no match runs from one line into the next. */
export function findInText(doc: Text, query: Query, limit = Infinity): SourceFound[] {
  const lines = doc.toJSON();
  const starts: number[] = [];
  lines.reduce((at, line) => (starts.push(at), at + line.length + 1), 0);
  return findInBlocks(lines, query, limit).map(({ block, match }) => {
    const from = starts[block] + match.index;
    return { from, to: from + match[0].length, match };
  });
}

const setMatches = StateEffect.define<DecorationSet>();

/** The find bar's matches, painted as the search matches of CodeMirror's own theme. */
export const findMatches = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (set, tr) => tr.effects.find((e) => e.is(setMatches))?.value ?? set.map(tr.changes),
  provide: (field) => EditorView.decorations.from(field),
});

const match = Decoration.mark({ class: "cm-searchMatch" });
const current = Decoration.mark({ class: "cm-searchMatch cm-searchMatch-selected" });

/** The find bar's view of the Source editor; `view` is undefined once the editor is gone, `listeners` hear of changes. */
export function sourceFind(view: () => EditorView | undefined, listeners: Set<() => void>): FindTarget<SourceFound> {
  return {
    find: (query, limit) => {
      const v = view();
      return v ? findInText(v.state.doc, query, limit) : [];
    },
    top: (f) => {
      const v = view();
      return v ? v.documentTop + v.lineBlockAt(f.from).top : 0;
    },
    show(found, index, reveal) {
      const f = found[index];
      view()?.dispatch({
        effects: [
          setMatches.of(Decoration.set(found.map((m, i) => (i === index ? current : match).range(m.from, m.to)))),
          ...(reveal && f ? [EditorView.scrollIntoView(f.from, { y: "nearest", yMargin: 48 })] : []),
        ],
      });
    },
    clear: () => view()?.dispatch({ effects: setMatches.of(Decoration.none) }),
    replace(found, texts) {
      const v = view();
      if (!v || !found.length) return 0;
      v.dispatch({ changes: found.map((f, i) => ({ from: f.from, to: f.to, insert: texts[i] })), annotations: isolateHistory.of("full") });
      return found[found.length - 1].from + texts[texts.length - 1].length;
    },
    watch(onChange) {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
  };
}
