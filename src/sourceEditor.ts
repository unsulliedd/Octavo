// Source mode's text editor (CodeMirror), loaded the first time Source mode opens.

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree, HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { Frontmatter, headingsOf, type SourceHeading } from "./sourceMarkdown";
import { sourceSession, type SourceSession } from "./sourceSession";

export type SourceEditor = {
  session: SourceSession;
  headings(): SourceHeading[];
  /** The top of each heading in the window, in the order of `headings`. */
  headingTops(): number[];
  /** Puts the cursor at `from` and scrolls its line to the top. */
  reveal(from: number): void;
  destroy(): void;
};

// Colors come from the app's theme, so light and dark both work.
const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "700", color: "var(--accent)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--link)" },
  { tag: t.monospace, backgroundColor: "var(--code-bg)" },
  { tag: [t.processingInstruction, t.meta, t.quote, t.contentSeparator, t.labelName], color: "var(--muted)" },
]);

const theme = EditorView.theme({
  "&": { color: "var(--ink)", backgroundColor: "transparent", fontSize: "calc(var(--doc-size) * 0.9)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.7" },
  ".cm-content": { padding: "0", caretColor: "var(--ink)" },
  ".cm-cursor": { borderLeftColor: "var(--ink)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "var(--select)" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--muted)", border: "none", paddingRight: "12px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--select) 50%, transparent)" },
  // Find matches look as they do in the reading view's find bar.
  ".cm-searchMatch": { backgroundColor: "var(--find-match)" },
  ".cm-searchMatch-selected": { backgroundColor: "var(--find-current)" },
  ".cm-panels": { backgroundColor: "var(--chrome)", color: "var(--ink)", fontFamily: "var(--ui)", fontSize: "13px" },
  ".cm-panels-top": { borderBottom: "1px solid var(--line)" },
  ".cm-textfield, .cm-button": { border: "1px solid var(--line)", borderRadius: "5px", backgroundColor: "var(--doc)", backgroundImage: "none", color: "var(--ink)", font: "inherit" },
  ".cm-textfield:focus": { outline: "none", borderColor: "var(--accent)" },
  ".cm-search label": { fontSize: "12.5px", color: "var(--muted)" },
  ".cm-panel button[name=close]": { color: "var(--muted)" },
});

/** Opens the Markdown `text` in `parent`; `onChange` runs on every edit. */
export function createSourceEditor(parent: HTMLElement, text: string, onChange: () => void): SourceEditor {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, extensions: [Frontmatter] }),
        syntaxHighlighting(highlight),
        search({ top: true }),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.contentAttributes.of({ "aria-label": "Markdown source", spellcheck: "false" }),
        EditorView.updateListener.of((u) => u.docChanged && onChange()),
        theme,
      ],
    }),
  });
  const current = () => view.state.doc.toString();
  const headings = () => {
    const state = view.state;
    return headingsOf(ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state), current());
  };
  return {
    // CodeMirror keeps line breaks as \n; the file's own come back when it is saved.
    session: sourceSession(current(), current),
    headings,
    headingTops: () => headings().map((h) => view.documentTop + view.lineBlockAt(h.from).top),
    reveal(from) {
      view.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: "start", yMargin: 16 }) });
      view.focus();
    },
    destroy: () => view.destroy(),
  };
}
