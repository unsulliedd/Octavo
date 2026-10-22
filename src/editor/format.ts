// Formatting the text at the cursor: headings, marks, links, lists, quotes, code blocks, undo; inserting tables, images, footnotes, rules and line breaks.

import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import { redoCommand, undoCommand } from "@milkdown/kit/plugin/history";
import {
  createCodeBlockCommand,
  insertHardbreakCommand,
  insertHrCommand,
  insertImageCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from "@milkdown/kit/preset/commonmark";
import { insertTableCommand, toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { lift } from "@milkdown/kit/prose/commands";
import { redoDepth, undoDepth } from "@milkdown/kit/prose/history";
import type { MarkType, Node as ProseNode } from "@milkdown/kit/prose/model";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { isInTable } from "@milkdown/kit/prose/tables";
import type { FormatAction, FormatState } from "./formatInfo";

type View = { state: EditorState; dispatch: (tr: Transaction) => void };

const MARKS: Partial<Record<FormatAction, string>> = {
  bold: "strong",
  italic: "emphasis",
  strike: "strike_through",
  code: "inlineCode",
  link: "link",
};

function markActive(state: EditorState, type: MarkType | undefined) {
  if (!type) return false;
  const { from, to, empty, $from } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

/** The innermost list around the cursor, with its position and the list item's. */
function listAt(state: EditorState) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "bullet_list" || node.type.name === "ordered_list") {
      return { list: node, pos: $from.before(d), item: $from.node(d + 1), itemPos: $from.before(d + 1) };
    }
  }
  return undefined;
}

const inside = (state: EditorState, name: string) => {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === name) return true;
  return false;
};

export function formatState(state: EditorState): FormatState {
  const active: FormatAction[] = [];
  for (const [action, mark] of Object.entries(MARKS)) {
    if (markActive(state, state.schema.marks[mark])) active.push(action as FormatAction);
  }
  const parent = state.selection.$from.parent;
  if (parent.type.name === "heading") active.push(`h${parent.attrs.level}` as FormatAction);
  if (parent.type.name === "code_block") active.push("codeBlock");
  const list = listAt(state);
  if (list?.item.attrs.checked != null) active.push("taskList");
  else if (list) active.push(list.list.type.name === "bullet_list" ? "bulletList" : "orderedList");
  if (inside(state, "blockquote")) active.push("quote");
  const disabled: FormatAction[] = [];
  if (!undoDepth(state)) disabled.push("undo");
  if (!redoDepth(state)) disabled.push("redo");
  if (isInTable(state)) disabled.push("table", "rule");
  if (state.doc.firstChild?.type.name === "frontmatter") disabled.push("properties");
  if (parent.type.name === "code_block") disabled.push("rule", "lineBreak", "image", "footnote", "mathInline", "mathBlock");
  return { active, disabled, href: active.includes("link") ? linkHref(state) : undefined };
}

/**
 * Runs a formatting action. A pressed button turns its format off again: a heading becomes a paragraph,
 * a list or quote is lifted, a code block becomes a paragraph. Links are set with `setLink`.
 */
const INSERTS: FormatAction[] = ["table", "image", "footnote", "mathInline", "mathBlock", "rule", "lineBreak"];

/** Moves a selection to its end, so what is inserted next goes after the selected text instead of replacing it. */
function toSelectionEnd(view: View) {
  const { selection, doc } = view.state;
  if (!selection.empty) view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(selection.to), -1)));
}

export function runFormat(ctx: Ctx, view: View, action: FormatAction) {
  if (INSERTS.includes(action)) toSelectionEnd(view);
  const commands = ctx.get(commandsCtx);
  const { state, dispatch } = view;
  const on = formatState(state).active.includes(action);
  const { nodes } = state.schema;
  switch (action) {
    case "undo":
      return commands.call(undoCommand.key);
    case "redo":
      return commands.call(redoCommand.key);
    case "paragraph":
      return commands.call(turnIntoTextCommand.key);
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return on ? commands.call(turnIntoTextCommand.key) : commands.call(wrapInHeadingCommand.key, Number(action[1]));
    case "bold":
      return commands.call(toggleStrongCommand.key);
    case "italic":
      return commands.call(toggleEmphasisCommand.key);
    case "strike":
      return commands.call(toggleStrikethroughCommand.key);
    case "code":
      return commands.call(toggleInlineCodeCommand.key);
    case "link":
      return setLink(view, null);
    case "quote":
      return on ? lift(state, dispatch) : commands.call(wrapInBlockquoteCommand.key);
    case "codeBlock":
      if (!on) return commands.call(createCodeBlockCommand.key);
      dispatch(state.tr.setBlockType(state.selection.from, state.selection.to, nodes.paragraph));
      return true;
    case "rule":
      return commands.call(insertHrCommand.key);
    case "lineBreak":
      return commands.call(insertHardbreakCommand.key);
    case "footnote":
      return insertFootnote(view);
    case "properties":
      return insertProperties(view);
    case "mathInline":
    case "mathBlock":
      return insertMath(view, action === "mathBlock");
    case "image":
      // Picking the file is the caller's part; see insertImage.
      return false;
    case "table":
      if (isInTable(state) || !commands.call(insertTableCommand.key, { row: 3, col: 3 })) return false;
      dispatch(withoutAlignment(view.state));
      return true;
    case "bulletList":
    case "orderedList":
    case "taskList":
      return toggleList(ctx, view, action);
  }
}

/** The code block the cursor is in, and its position. */
export function codeBlockAt(state: EditorState) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.type.name === "code_block") return { node, pos: $from.before(d), language: String(node.attrs.language ?? "") };
  }
  return undefined;
}

/** Sets the language of the code block at the cursor; an empty language makes it plain text. */
export function setCodeLanguage(view: View, language: string) {
  const block = codeBlockAt(view.state);
  if (!block || block.language === language) return false;
  view.dispatch(view.state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, language }));
  return true;
}

/** Ticks or unticks the task list item at `pos`. */
export function toggleTask(view: View, pos: number) {
  const item = view.state.doc.nodeAt(pos);
  if (!item || item.attrs.checked == null) return false;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...item.attrs, checked: !item.attrs.checked }));
  return true;
}

/** The formula selected in the editor, if any: its source, its position, and whether it is a block. */
export function mathAt(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return undefined;
  const { node, from } = selection;
  if (node.type.name !== "math_inline" && node.type.name !== "math_block") return undefined;
  return { value: String(node.attrs.value ?? ""), pos: from, block: node.type.name === "math_block" };
}

/**
 * Inserts an empty formula and selects it, so its editor opens: inline at the cursor, or as a block in
 * place of an empty paragraph or after the block the cursor is in.
 */
function insertMath(view: View, block: boolean) {
  const { state } = view;
  const { $from } = state.selection;
  const tr = state.tr;
  let pos = $from.pos;
  if (!block) tr.insert(pos, state.schema.nodes.math_inline.create({ value: "" }));
  else {
    const node = state.schema.nodes.math_block.create({ value: "" });
    const top = $from.depth > 0 ? $from.before(1) : 0;
    if ($from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0) {
      pos = top;
      tr.replaceWith(top, top + $from.parent.nodeSize, node);
    } else {
      pos = $from.depth > 0 ? $from.after(1) : state.doc.content.size;
      tr.insert(pos, node);
    }
  }
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)).scrollIntoView());
  return true;
}

/**
 * Writes `value` into the selected formula and moves the cursor after it, or removes the formula when
 * `value` is empty.
 */
export function setMath(view: View, value: string) {
  const math = mathAt(view.state);
  if (!math) return false;
  const node = view.state.doc.nodeAt(math.pos)!;
  const tr = view.state.tr;
  if (!value.trim()) tr.delete(math.pos, math.pos + node.nodeSize);
  else tr.setNodeMarkup(math.pos, undefined, { ...node.attrs, value });
  const after = tr.mapping.map(math.pos + node.nodeSize);
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(after, tr.doc.content.size)))));
  return true;
}

/** The selected Mermaid diagram, if any: its source and position. */
export function mermaidAt(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return undefined;
  const { node, from } = selection;
  if (node.type.name !== "code_block" || node.attrs.language !== "mermaid") return undefined;
  return { value: node.textContent, pos: from };
}

/** Writes the selected diagram's source, or removes the diagram when it is empty, and puts the cursor after it. */
export function setMermaid(view: View, value: string) {
  const diagram = mermaidAt(view.state);
  if (!diagram) return false;
  const node = view.state.doc.nodeAt(diagram.pos)!;
  const tr = view.state.tr;
  if (!value.trim()) tr.delete(diagram.pos, diagram.pos + node.nodeSize);
  else if (value !== diagram.value) tr.replaceWith(diagram.pos + 1, diagram.pos + node.nodeSize - 1, view.state.schema.text(value));
  const after = tr.mapping.map(diagram.pos + node.nodeSize);
  // The cursor goes into the next block; when that is missing or another diagram, into a new paragraph.
  const next = tr.doc.resolve(after).nodeAfter;
  const diagramNext = next?.type.name === "code_block" && next.attrs.language === "mermaid";
  if (!next?.isTextblock || diagramNext) tr.insert(after, view.state.schema.nodes.paragraph.create());
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)));
  return true;
}

/** Turns the selected diagram into a plain code block with the cursor at its start. */
export function mermaidToCode(view: View) {
  const diagram = mermaidAt(view.state);
  if (!diagram) return false;
  const node = view.state.doc.nodeAt(diagram.pos)!;
  const tr = view.state.tr.setNodeMarkup(diagram.pos, undefined, { ...node.attrs, language: "" });
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, diagram.pos + 1)));
  return true;
}

/** A cursor that lands in a Mermaid diagram selects the whole diagram; its source is edited in a dialog. */
export function selectDiagram(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return undefined;
  const { $from, $to } = selection;
  const block = $from.parent;
  if (block.type.name !== "code_block" || block.attrs.language !== "mermaid" || !$to.sameParent($from)) return undefined;
  return state.tr.setSelection(NodeSelection.create(state.doc, $from.before()));
}

/** The selected image, if any: its source, alt text, title and position. */
export function imageAt(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") return undefined;
  const { attrs } = selection.node;
  return { src: String(attrs.src ?? ""), alt: String(attrs.alt ?? ""), title: String(attrs.title ?? ""), pos: selection.from };
}

/** Sets the selected image's alt text and title, and puts the cursor after it. */
export function setImage(view: View, alt: string, title: string) {
  const image = imageAt(view.state);
  if (!image) return false;
  const node = view.state.doc.nodeAt(image.pos)!;
  const tr = view.state.tr.setNodeMarkup(image.pos, undefined, { ...node.attrs, alt, title });
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(image.pos + node.nodeSize))));
  return true;
}

/** Inserts an image at the cursor. */
export function insertImage(ctx: Ctx, src: string, alt: string) {
  toSelectionEnd(ctx.get(editorViewCtx));
  return ctx.get(commandsCtx).call(insertImageCommand.key, { src, alt });
}

/**
 * Inserts a reference to a new footnote at the cursor, numbered with the first unused number, and its note
 * at the end of the document, with the cursor in the note.
 */
/** Empty frontmatter at the start of the document; its panel takes the focus. */
function insertProperties(view: View) {
  const { state } = view;
  if (state.doc.firstChild?.type.name === "frontmatter") return false;
  view.dispatch(state.tr.insert(0, state.schema.nodes.frontmatter.create({ value: "" })).scrollIntoView());
  return true;
}

function insertFootnote(view: View) {
  const { state } = view;
  const { footnote_reference: reference, footnote_definition: definition, paragraph } = state.schema.nodes;
  const used = new Set<string>();
  state.doc.descendants((node) => {
    if (node.type === reference || node.type === definition) used.add(String(node.attrs.label));
  });
  let n = 1;
  while (used.has(String(n))) n++;
  const label = String(n);
  const tr = state.tr.replaceSelectionWith(reference.create({ label }), false);
  const end = tr.doc.content.size;
  tr.insert(end, definition.create({ label }, paragraph.create()));
  // Inside the note's paragraph: past the start of the definition and of the paragraph.
  tr.setSelection(TextSelection.create(tr.doc, end + 2)).scrollIntoView();
  view.dispatch(tr);
  return true;
}

/** The table the cursor is in, with no column alignment: a new table is written with plain `-` delimiters. */
function withoutAlignment(state: EditorState) {
  const tr = state.tr;
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== "table") continue;
    const start = $from.before(d);
    $from.node(d).descendants((node, pos) => {
      if (node.attrs.alignment !== undefined) tr.setNodeMarkup(start + 1 + pos, undefined, { ...node.attrs, alignment: null });
    });
    break;
  }
  return tr;
}

function toggleList(ctx: Ctx, view: View, action: "bulletList" | "orderedList" | "taskList") {
  const commands = ctx.get(commandsCtx);
  const { nodes } = view.state.schema;
  const list = listAt(view.state);
  const listType = action === "orderedList" ? nodes.ordered_list : nodes.bullet_list;
  const task = action === "taskList";
  if (!list) {
    if (!commands.call((task ? wrapInBulletListCommand : action === "orderedList" ? wrapInOrderedListCommand : wrapInBulletListCommand).key)) {
      return false;
    }
    if (task) {
      const added = listAt(view.state);
      if (added) view.dispatch(view.state.tr.setNodeMarkup(added.itemPos, undefined, { ...added.item.attrs, checked: false }));
    }
    return true;
  }
  const isTask = list.item.attrs.checked != null;
  const sameType = list.list.type === listType;
  // The same kind of list again: the item leaves the list.
  if (sameType && isTask === task) return liftListItem(nodes.list_item)(view.state, view.dispatch);
  // Another kind: the list changes kind, and its items become tasks or stop being tasks. Items carry
  // their list's kind too; Milkdown turns a list back into a numbered one while its items say so.
  const tr = view.state.tr;
  const ordered = listType === nodes.ordered_list;
  if (!sameType) tr.setNodeMarkup(list.pos, listType, { spread: list.list.attrs.spread });
  list.list.forEach((item: ProseNode, offset: number, index: number) => {
    const checked = task ? (item.attrs.checked ?? false) : null;
    const kind = ordered ? { listType: "ordered", label: `${index + 1}.` } : { listType: "bullet", label: "•" };
    tr.setNodeMarkup(list.pos + 1 + offset, undefined, { ...item.attrs, ...kind, checked });
  });
  view.dispatch(tr);
  return true;
}

/** The run of text linked by one link around an empty selection, with its address. */
function linkAt(state: EditorState) {
  const link = state.schema.marks.link;
  const { from, $from } = state.selection;
  const start = $from.start();
  let run: { from: number; to: number; href: string } | undefined;
  let found: typeof run;
  $from.parent.forEach((child, offset) => {
    const a = start + offset;
    const b = a + child.nodeSize;
    const mark = link.isInSet(child.marks);
    if (!mark) {
      run = undefined;
      return;
    }
    if (run && run.href === mark.attrs.href && run.to === a) run.to = b;
    else run = { from: a, to: b, href: String(mark.attrs.href) };
    if (!found && a <= from && from <= b) found = run;
  });
  return found;
}

/** The address of the link at the cursor, or of the first link in the selection. */
export function linkHref(state: EditorState) {
  const link = state.schema.marks.link;
  const { from, to, empty } = state.selection;
  if (empty) return link.isInSet(state.storedMarks ?? state.selection.$from.marks()) ? linkAt(state)?.href : undefined;
  let href: string | undefined;
  state.doc.nodesBetween(from, to, (node) => {
    const mark = href === undefined ? link.isInSet(node.marks) : undefined;
    if (mark) href = String(mark.attrs.href);
  });
  return href;
}

/**
 * Links the selection to `href`, or removes the link at the cursor with `href` null. With nothing
 * selected, the link at the cursor gets the new address, and outside a link `href` is inserted as
 * linked text.
 */
export function setLink(view: View, href: string | null) {
  const { state, dispatch } = view;
  const link = state.schema.marks.link;
  const { from, to, empty } = state.selection;
  const range = empty ? linkAt(state) : { from, to };
  if (href === null) {
    if (!range) return false;
    dispatch(state.tr.removeMark(range.from, range.to, link));
    return true;
  }
  const mark = link.create({ href, title: null });
  if (!range) dispatch(state.tr.insert(from, state.schema.text(href, [mark])));
  else dispatch(state.tr.removeMark(range.from, range.to, link).addMark(range.from, range.to, mark));
  return true;
}
