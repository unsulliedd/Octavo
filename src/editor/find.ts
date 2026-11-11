// Find and replace in the editor: matches are found in the document model, so formulas match by their source
// before they are drawn; they are painted as decorations and replaced in one transaction, one undo step.

import { closeHistory } from "@milkdown/kit/prose/history";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { bringIntoView, findInBlocks, type FindTarget, type Found, type Query } from "@/reading/find";

/**
 * A match in the editor, from `from` to `to` in the document. A match in the source of a formula or of the
 * frontmatter has that node's position as `atom`, and a `from` between `atom` and `atom + 1` that keeps the order.
 */
export type EditFound = Found & { to: number; atom?: number };

type Block = { text: string; start: number; atom?: boolean };

/** Nodes whose text is their `value` attribute: formulas and the frontmatter. */
const hasSource = (node: ProseNode) => node.isAtom && typeof node.attrs.value === "string";

/**
 * The searchable blocks of `doc` in document order: the runs of text in each textblock (a line break counts as
 * "\n"; an image or a formula ends a run), and the source of each formula and of the frontmatter.
 */
export function docBlocks(doc: ProseNode): Block[] {
  const blocks: Block[] = [];
  doc.descendants((node, pos) => {
    if (hasSource(node)) {
      blocks.push({ text: node.attrs.value, start: pos, atom: true });
      return false;
    }
    if (!node.isTextblock) return true;
    let run: Block | undefined;
    node.forEach((child, offset) => {
      const at = pos + 1 + offset;
      if (child.isText || child.type.name === "hardbreak") {
        if (!run) blocks.push((run = { text: "", start: at }));
        run.text += child.isText ? child.text! : "\n";
      } else {
        run = undefined;
        if (hasSource(child)) blocks.push({ text: child.attrs.value, start: at, atom: true });
      }
    });
    return false;
  });
  return blocks;
}

/** The matches of `query` in `doc`, at most `limit`. */
export function findInDoc(doc: ProseNode, query: Query, limit = Infinity): EditFound[] {
  const blocks = docBlocks(doc);
  return findInBlocks(
    blocks.map((b) => b.text),
    query,
    limit,
  ).map(({ block, match }) => {
    const { text, start, atom } = blocks[block];
    if (atom) return { from: start + (match.index + 1) / (text.length + 2), to: start + 1, match, atom: start };
    return { from: start + match.index, to: start + match.index + match[0].length, match };
  });
}

/**
 * One transaction that replaces each match with its text: text takes the marks of the text it replaces, a formula or
 * the frontmatter gets its new source. It starts an undo step of its own.
 */
export function replaceFound(state: EditorState, found: EditFound[], texts: string[]) {
  const tr = closeHistory(state.tr);
  // Back to front, so the positions of the matches still to replace don't move.
  const order = found.map((_, i) => i).sort((a, b) => found[b].from - found[a].from);
  for (const i of order) {
    const { from, to, atom, match } = found[i];
    if (atom !== undefined) {
      const node = tr.doc.nodeAt(atom)!;
      const value = String(node.attrs.value);
      tr.setNodeMarkup(atom, undefined, { ...node.attrs, value: value.slice(0, match.index) + texts[i] + value.slice(match.index + match[0].length) });
    } else if (texts[i]) tr.replaceWith(from, to, state.schema.text(texts[i], tr.doc.nodeAt(from)?.marks));
    else tr.delete(from, to);
  }
  return tr;
}

/** Where the text that replaced `found` ends, as a `from` of the matches found after the replacement. */
function endOf({ from, atom, match }: EditFound, text: string, doc: ProseNode) {
  if (atom === undefined) return from + text.length;
  const length = String(doc.nodeAt(atom)?.attrs.value ?? "").length;
  return atom + (match.index + text.length + 1) / (length + 2);
}

const findKey = new PluginKey<DecorationSet>("find");

/** Paints the find bar's matches; `changed` runs after each change to the document. */
export function findPlugin(changed: () => void) {
  return new Plugin<DecorationSet>({
    key: findKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, set) => tr.getMeta(findKey) ?? set.map(tr.mapping, tr.doc),
    },
    props: { decorations: (state) => findKey.getState(state) },
    view: () => ({ update: (view, prev) => void (view.state.doc !== prev.doc && changed()) }),
  });
}

/** The find bar's view of the editor; `view` is undefined once the editor is gone, `listeners` hear of changes. */
export function editorFind(view: () => EditorView | undefined, listeners: Set<() => void>): FindTarget<EditFound> {
  const paint = (set: DecorationSet) => {
    const v = view();
    v?.dispatch(v.state.tr.setMeta(findKey, set));
  };
  return {
    find: (query, limit) => {
      const v = view();
      return v ? findInDoc(v.state.doc, query, limit) : [];
    },
    top: (f) => view()?.coordsAtPos(f.atom ?? f.from).top ?? 0,
    show(found, current, reveal) {
      const v = view();
      if (!v) return;
      const { doc } = v.state;
      const decorations = found.map((f, i) => {
        const attrs = { class: i === current ? "find-match find-current" : "find-match" };
        return f.atom === undefined ? Decoration.inline(f.from, f.to, attrs) : Decoration.node(f.atom, f.atom + doc.nodeAt(f.atom)!.nodeSize, attrs);
      });
      paint(DecorationSet.create(doc, decorations));
      const f = found[current];
      const scroller = v.dom.closest(".reader");
      if (reveal && f && scroller) bringIntoView(v.coordsAtPos(f.atom ?? f.from), scroller);
    },
    clear: () => paint(DecorationSet.empty),
    replace(found, texts) {
      const v = view();
      if (!v || !found.length) return 0;
      v.dispatch(replaceFound(v.state, found, texts));
      return endOf(found[found.length - 1], texts[texts.length - 1], v.state.doc);
    },
    watch(onChange) {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
  };
}
