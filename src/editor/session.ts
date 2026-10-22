// The Milkdown editor for one document. Loaded on the first Edit, so reading never loads ProseMirror.

import { defaultValueCtx, Editor, editorViewCtx, parserCtx, rootCtx } from "@milkdown/kit/core";
import { history, historyKeymap } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import {
  blockquoteKeymap,
  bulletListKeymap,
  codeBlockKeymap,
  codeBlockSchema,
  emphasisKeymap,
  hardbreakKeymap,
  headingKeymap,
  imageSchema,
  inlineCodeKeymap,
  listItemSchema,
  orderedListKeymap,
  paragraphKeymap,
  strongKeymap,
} from "@milkdown/kit/preset/commonmark";
import { gfm, strikethroughKeymap } from "@milkdown/kit/preset/gfm";
import type { Ctx, SliceType } from "@milkdown/kit/ctx";
import { NodeSelection, Plugin } from "@milkdown/kit/prose/state";
import { diagramSvg, isDark } from "../mermaid";
import { $prose, $view, getMarkdown } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { escapeStrayDollars } from "../render";
import { editorText } from "../fileText";
import katex from "katex";
import "katex/dist/katex.min.css";
import { configureMarkdown, octavoCommonmark, octavoMarkdown, frontmatterSchema, mathBlockSchema, mathInlineSchema } from "./markdown";
import { cleanKey, parseProperties, serializeProperties, type Property } from "../properties";
import { markdownStyle, preserveUnchanged } from "./preserve";
import {
  codeBlockAt,
  formatState,
  imageAt,
  insertImage,
  mathAt,
  mermaidAt,
  mermaidToCode,
  runFormat,
  selectDiagram,
  setCodeLanguage,
  setImage,
  setLink,
  setMath,
  setMermaid,
  toggleTask,
} from "./format";
import type { FormatAction, FormatState } from "./formatInfo";
import { runTableAction, tableAt, tablePos } from "./table";
import type { TableAction, TableInfo } from "./tableInfo";

/**
 * The editor's content at one moment, as Markdown. `exact` tells whether that Markdown loads back as
 * exactly this content; only then is it safe to save.
 */
export type Snapshot = { markdown: string; doc: ProseNode; exact: boolean };

export type EditorSession = {
  /** The document as Markdown, serialized from the editor. */
  markdown(): string;
  /**
   * The content as Markdown to save over `base`, the file text the edits were made to: blocks whose
   * content didn't change keep their text from `base`. Without `base`, the editor's own Markdown.
   */
  snapshot(base?: string): Snapshot;
  /** True when the content differs from what was loaded or last saved; undoing every change makes it false again. */
  edited(): boolean;
  /** Marks a snapshot's content as saved; changes made after it still count as edits. */
  markSaved(snapshot: Snapshot): void;
  /** The table the cursor is in, if any, and its element. */
  table(): { info: TableInfo; element: HTMLElement } | undefined;
  tableAction(action: TableAction): void;
  /** What the formatting bar shows for the cursor's position. */
  format(): FormatState;
  /** Where the selection starts and ends in the window, and whether it is only a cursor. */
  selection(): { start: Box; end: Box; empty: boolean };
  formatAction(action: FormatAction): void;
  insertImage(src: string, alt: string): void;
  /** The selected image, if any: its source, alt text, title and element. */
  image(): { src: string; alt: string; title: string; element: HTMLElement } | undefined;
  /** Sets the selected image's alt text and title, and puts the cursor after it. */
  setImage(alt: string, title: string): void;
  /** The selected Mermaid diagram, if any: its source. */
  diagram(): { value: string } | undefined;
  /** Writes the selected diagram's source, or removes it when empty, and puts the cursor after it. */
  setDiagram(value: string): void;
  /** Turns the selected diagram into a plain code block. */
  diagramToCode(): void;
  /** The code block the cursor is in, if any: its language and its element. */
  codeBlock(): { language: string; element: HTMLElement } | undefined;
  setCodeLanguage(language: string): void;
  /** The selected formula, if any: its source, whether it is a block, and its element. */
  math(): { value: string; block: boolean; element: HTMLElement } | undefined;
  /** Writes the selected formula's source, or removes it when empty, and puts the cursor after it. */
  setMath(value: string): void;
  /** A formula as HTML, as the reading view shows it. */
  renderMath(value: string, block: boolean): string;
  /** Links the selection to `href`, or removes the link at the cursor with null. */
  setLink(href: string | null): void;
  focus(): void;
  destroy(): Promise<void>;
};

type Box = { left: number; top: number; bottom: number };

type Options = {
  /** Maps an image source from the document to a URL the webview can load. */
  imageUrl: (src: string) => string;
  /** Called after every change to the content. */
  onChange: () => void;
  /** Called when the selection moves. */
  onSelection?: () => void;
  /** Called on every key press in the editor before its own keys; true when it handled the key. */
  onKey?: (event: KeyboardEvent) => boolean;
  /** Called when image files are pasted; true when it takes care of them. */
  onPasteImages?: (files: File[]) => boolean;
};

type NodeJson = { type: string; attrs?: Record<string, unknown>; content?: NodeJson[] };

/** The content as JSON, without the heading ids the editor derives from the heading text. */
export function contentKey(node: ProseNode) {
  const strip = (n: NodeJson): NodeJson => {
    const { id: _, ...attrs } = n.attrs ?? {};
    // Markdown can't hold an empty task: `- [ ]` with nothing after it opens as an empty bullet.
    const emptyTask = n.type === "list_item" && n.attrs?.checked != null && n.content?.length === 1 && !n.content[0].content?.length;
    const kept = n.type === "heading" ? attrs : emptyTask ? { ...n.attrs, checked: null } : n.attrs;
    return { ...n, attrs: kept, content: n.content?.map(strip) };
  };
  return JSON.stringify(strip(node.toJSON() as NodeJson));
}

/** Images show the document's own files: their source is mapped to a loadable URL in the view only. */
const imageView = (imageUrl: (src: string) => string) =>
  $view(imageSchema.node, () => (node: ProseNode) => {
    const img = document.createElement("img");
    img.src = imageUrl(String(node.attrs.src ?? ""));
    img.alt = String(node.attrs.alt ?? "");
    if (node.attrs.title) img.title = String(node.attrs.title);
    return { dom: img };
  });

/**
 * List items with the attributes Milkdown gives them. A task item also gets a checkbox that ticks it, with
 * the item's content beside it; an item that becomes or stops being a task is drawn again.
 */
/**
 * Code blocks as Milkdown draws them, except Mermaid diagrams, which show drawn as in the reading view.
 * Clicking a diagram selects it; its source is edited in a dialog. A block that becomes or stops being a
 * diagram is drawn again.
 */
const codeBlockView = $view(codeBlockSchema.node, () => (initial, view, getPos) => {
  const diagram = initial.attrs.language === "mermaid";
  const same = (node: ProseNode) => node.type === initial.type && (node.attrs.language === "mermaid") === diagram;
  if (!diagram) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.append(code);
    const describe = (node: ProseNode) => (node.attrs.language ? (pre.dataset.language = node.attrs.language) : delete pre.dataset.language);
    describe(initial);
    return { dom: pre, contentDOM: code, update: (node: ProseNode) => same(node) && (describe(node), true) };
  }
  const dom = document.createElement("div");
  dom.className = "mermaid-block";
  dom.contentEditable = "false";
  let shown: string | undefined;
  const draw = (source: string) => {
    if (source === shown) return;
    shown = source;
    if (!source.trim()) return void (dom.textContent = "Empty diagram: click to write it");
    void diagramSvg(source, isDark(view.dom)).then((result) => {
      if (shown !== source) return;
      if ("svg" in result) dom.innerHTML = result.svg;
      else dom.textContent = `This diagram has an error: ${result.error}`;
      dom.toggleAttribute("data-error", "error" in result);
    });
  };
  draw(initial.textContent);
  dom.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const pos = getPos();
    if (pos !== undefined) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    view.focus();
  });
  return {
    dom,
    update: (node: ProseNode) => same(node) && (draw(node.textContent), true),
    stopEvent: (event: Event) => event.type === "mousedown",
    ignoreMutation: () => true,
  };
});

const listItemView = $view(listItemSchema.node, () => (initial, view, getPos) => {
  const task = initial.attrs.checked != null;
  const li = document.createElement("li");
  const describe = (node: ProseNode) => {
    li.dataset.listType = String(node.attrs.listType);
    li.dataset.label = String(node.attrs.label);
    li.dataset.spread = String(node.attrs.spread);
    if (task) {
      li.dataset.itemType = "task";
      li.dataset.checked = String(node.attrs.checked);
    }
  };
  describe(initial);
  const same = (node: ProseNode) => node.type === initial.type && (node.attrs.checked != null) === task;
  if (!task) return { dom: li, contentDOM: li, update: (node: ProseNode) => same(node) && (describe(node), true) };
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(initial.attrs.checked);
  box.setAttribute("aria-label", "Done");
  box.addEventListener("click", () => {
    const pos = getPos();
    if (pos !== undefined) toggleTask(view, pos);
  });
  const content = document.createElement("div");
  content.className = "task-content";
  li.append(box, content);
  return {
    dom: li,
    contentDOM: content,
    update: (node: ProseNode) => {
      if (!same(node)) return false;
      describe(node);
      box.checked = Boolean(node.attrs.checked);
      return true;
    },
    stopEvent: (event: Event) => event.target === box,
    ignoreMutation: (mutation: { target: Node; type: string }) => mutation.target === box || (mutation.type === "attributes" && mutation.target === li),
  };
});

/** A formula as KaTeX HTML; errors show in red instead of throwing. */
const mathHtml = (value: string, block: boolean) => katex.renderToString(value, { displayMode: block, throwOnError: false });

/** Formulas show rendered, as in the reading view; the source is edited in a popover when one is selected. */
const mathView = (schema: typeof mathInlineSchema, block: boolean) =>
  $view(schema.node, () => (node: ProseNode) => {
    const dom = document.createElement(block ? "div" : "span");
    dom.dataset.type = node.type.name;
    const value = String(node.attrs.value ?? "");
    if (value.trim()) dom.innerHTML = mathHtml(value, block);
    else dom.textContent = "Formula";
    dom.toggleAttribute("data-empty", !value.trim());
    return { dom };
  });

/**
 * The frontmatter as a properties panel: a name and value row per property, or the YAML itself when it goes
 * deeper than that. Every change is written to the node as YAML; the panel's controls keep their own keys.
 */
const propertiesView = $view(frontmatterSchema.node, () => (initial, view, getPos) => {
  let written = String(initial.attrs.value ?? "");
  const dom = document.createElement("section");
  dom.className = "properties";
  dom.contentEditable = "false";
  dom.setAttribute("aria-label", "Properties");
  const write = (value: string) => {
    const pos = getPos();
    if (pos === undefined || value === written) return;
    written = value;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { value }));
  };
  const el = (tag: string, className: string, ...children: (Node | string)[]) => {
    const node = document.createElement(tag);
    node.className = className;
    node.append(...children);
    return node;
  };
  const input = (className: string, value: string, placeholder: string) => {
    const field = document.createElement("input");
    Object.assign(field, { className, value, placeholder, spellcheck: false });
    return field;
  };
  const iconButton = (label: string, onClick: () => void) => {
    const button = document.createElement("button");
    Object.assign(button, { type: "button", className: "icon-btn small", title: label, onclick: onClick });
    button.setAttribute("aria-label", label);
    button.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
    return button;
  };

  function draw(value: string, focus: boolean) {
    const rows = parseProperties(value);
    const remove = iconButton("Remove properties", () => {
      const pos = getPos();
      if (pos !== undefined) view.dispatch(view.state.tr.delete(pos, pos + view.state.doc.nodeAt(pos)!.nodeSize));
      view.focus();
    });
    const head = el("div", "properties-head", el("span", "setting-label", "Properties"));
    if (!rows) {
      const yaml = document.createElement("textarea");
      Object.assign(yaml, { value, rows: Math.max(3, value.split("\n").length), spellcheck: false, oninput: () => write(yaml.value) });
      yaml.setAttribute("aria-label", "Properties as YAML");
      head.append(el("span", "setting-hint", "Edited as YAML: these properties go deeper than name and value"), remove);
      dom.replaceChildren(head, yaml);
      return;
    }
    const list = el("div", "properties-rows");
    const read = (): Property[] =>
      [...list.querySelectorAll(".properties-row")].map((row) => {
        const [key, val] = row.querySelectorAll("input");
        return { key: key.value, value: val.value };
      });
    const addRow = (p: Property) => {
      const key = input("key", p.key, "Name");
      const val = input("", p.value, "Value");
      key.setAttribute("aria-label", "Property name");
      const label = () => val.setAttribute("aria-label", key.value ? `Value of ${key.value}` : "Property value");
      label();
      key.oninput = () => {
        key.value = cleanKey(key.value);
        label();
        write(serializeProperties(read()));
      };
      val.oninput = () => write(serializeProperties(read()));
      const row = el("div", "properties-row", key, val);
      row.append(
        iconButton("Remove this property", () => {
          row.remove();
          write(serializeProperties(read()));
        }),
      );
      list.append(row);
      return key;
    };
    rows.forEach(addRow);
    const first = rows.length ? undefined : addRow({ key: "", value: "" });
    const add = el("button", "text-btn quiet", "+ Add property") as HTMLButtonElement;
    add.type = "button";
    add.onclick = () => addRow({ key: "", value: "" }).focus();
    head.append(remove);
    dom.replaceChildren(head, list, el("div", "properties-foot", add));
    // New, empty properties take the focus once the editor has finished with it.
    if (focus && first) setTimeout(() => first.focus());
  }
  draw(written, !written);
  return {
    dom,
    update: (node: ProseNode) => {
      if (node.type !== initial.type) return false;
      const value = String(node.attrs.value ?? "");
      // The panel's own edits are already on screen; undo and redo draw it again.
      if (value !== written) draw((written = value), false);
      return true;
    },
    stopEvent: () => true,
    ignoreMutation: () => true,
  };
});

/** Milkdown's own keys for the actions the shortcut settings list are turned off; `onKey` runs those actions. */
function withoutFormatKeys(ctx: Ctx) {
  type Config = Record<string, { shortcuts: string | string[]; priority?: number }>;
  const off = <C extends Config>(keymap: { key: SliceType<C, string> }, names: (keyof C & string)[]) =>
    ctx.update(keymap.key, (config) => ({ ...config, ...Object.fromEntries(names.map((n) => [n, { shortcuts: [] }])) }));
  off(strongKeymap, ["ToggleBold"]);
  off(emphasisKeymap, ["ToggleEmphasis"]);
  off(inlineCodeKeymap, ["ToggleInlineCode"]);
  off(strikethroughKeymap, ["ToggleStrikethrough"]);
  off(blockquoteKeymap, ["WrapInBlockquote"]);
  off(bulletListKeymap, ["WrapInBulletList"]);
  off(orderedListKeymap, ["WrapInOrderedList"]);
  off(codeBlockKeymap, ["CreateCodeBlock"]);
  off(hardbreakKeymap, ["InsertHardbreak"]);
  off(headingKeymap, ["TurnIntoH1", "TurnIntoH2", "TurnIntoH3", "TurnIntoH4", "TurnIntoH5", "TurnIntoH6"]);
  off(paragraphKeymap, ["TurnIntoText"]);
  off(historyKeymap, ["Undo", "Redo"]);
}

/** Creates an editor in `root` for `markdown`. Stray `$` are escaped first, as the reader does, so prices stay text. */
export async function createEditor(root: HTMLElement, markdown: string, { imageUrl, onChange, onSelection, onKey, onPasteImages }: Options): Promise<EditorSession> {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, escapeStrayDollars(markdown));
      configureMarkdown(ctx, markdownStyle(markdown));
      withoutFormatKeys(ctx);
      ctx.get(listenerCtx).updated(() => onChange());
      ctx.get(listenerCtx).selectionUpdated(() => onSelection?.());
    })
    .use(octavoCommonmark)
    .use(gfm)
    .use(octavoMarkdown)
    .use(history)
    .use(listener)
    .use(imageView(imageUrl))
    .use(mathView(mathInlineSchema, false))
    .use(mathView(mathBlockSchema, true))
    .use(listItemView)
    .use(propertiesView)
    .use(codeBlockView)
    .use(
      $prose(
        () =>
          new Plugin({
            appendTransaction: (_, __, state) => selectDiagram(state),
            props: {
              handleKeyDown: (_, event) => onKey?.(event) ?? false,
              handlePaste: (_, event) => {
                const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
                return files.length > 0 && (onPasteImages?.(files) ?? false);
              },
            },
          }),
      ),
    )
    .create();
  const view = () => editor.ctx.get(editorViewCtx);
  let saved = view().state.doc;
  const serialize = () => editor.action(getMarkdown());
  return {
    markdown: serialize,
    snapshot: (base) => {
      const doc = view().state.doc;
      const opensAsDoc = (md: string) => {
        try {
          return contentKey(editor.ctx.get(parserCtx)(escapeStrayDollars(md))) === contentKey(doc);
        } catch {
          // Markdown the parser rejects is not safe to save either.
          return false;
        }
      };
      const markdown = serialize();
      if (base !== undefined) {
        const kept = preserveUnchanged(editorText(base).replace(/\r\n?/g, "\n"), markdown);
        if (kept !== markdown && opensAsDoc(kept)) return { doc, markdown: kept, exact: true };
      }
      return { doc, markdown, exact: opensAsDoc(markdown) };
    },
    edited: () => !view().state.doc.eq(saved),
    markSaved: (snapshot) => void (saved = snapshot.doc),
    table: () => {
      const info = tableAt(view().state);
      const pos = tablePos(view().state);
      const element = pos === undefined ? null : view().nodeDOM(pos);
      return info && element instanceof HTMLElement ? { info, element } : undefined;
    },
    tableAction: (action) => {
      runTableAction(editor.ctx, action, view().state, view().dispatch);
      view().focus();
    },
    format: () => formatState(view().state),
    selection: () => {
      const { from, to, empty } = view().state.selection;
      return { start: view().coordsAtPos(from), end: view().coordsAtPos(to), empty };
    },
    formatAction: (action) => {
      runFormat(editor.ctx, view(), action);
      view().focus();
    },
    codeBlock: () => {
      const block = codeBlockAt(view().state);
      const element = block && view().nodeDOM(block.pos);
      return block && element instanceof HTMLElement ? { language: block.language, element } : undefined;
    },
    setCodeLanguage: (language) => {
      setCodeLanguage(view(), language);
      view().focus();
    },
    math: () => {
      const math = mathAt(view().state);
      const element = math && view().nodeDOM(math.pos);
      return math && element instanceof HTMLElement ? { value: math.value, block: math.block, element } : undefined;
    },
    setMath: (value) => {
      setMath(view(), value);
      view().focus();
    },
    renderMath: mathHtml,
    insertImage: (src, alt) => {
      insertImage(editor.ctx, src, alt);
      view().focus();
    },
    image: () => {
      const image = imageAt(view().state);
      const element = image && view().nodeDOM(image.pos);
      return image && element instanceof HTMLElement ? { src: image.src, alt: image.alt, title: image.title, element } : undefined;
    },
    diagram: () => {
      const diagram = mermaidAt(view().state);
      return diagram && { value: diagram.value };
    },
    setDiagram: (value) => {
      setMermaid(view(), value);
      view().focus();
    },
    diagramToCode: () => {
      mermaidToCode(view());
      view().focus();
    },
    setImage: (alt, title) => {
      setImage(view(), alt, title);
      view().focus();
    },
    setLink: (href) => {
      setLink(view(), href);
      view().focus();
    },
    focus: () => view().focus(),
    destroy: async () => void (await editor.destroy()),
  };
}
