// The formatting bar's actions and what it shows. Kept free of editor code, so the bar is part of the
// startup bundle without the editor.

export type FormatAction =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "link"
  | "lineBreak"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "codeBlock"
  | "rule"
  | "image"
  | "footnote"
  | "mathInline"
  | "mathBlock"
  | "table"
  | "properties"
  | "undo"
  | "redo";

/** The actions that have a button; the others only have a shortcut. */
export type BarAction = Exclude<FormatAction, "paragraph" | "h4" | "h5" | "h6">;

/** Which actions are on where the cursor is (pressed buttons), which can't run there, and the address of the link at the cursor. */
export type FormatState = { active: FormatAction[]; disabled: FormatAction[]; href?: string };

/** The buttons in groups, with their tooltips; their keys come from the shortcut settings. */
export const FORMAT_GROUPS: { action: BarAction; label: string }[][] = [
  [
    { action: "undo", label: "Undo" },
    { action: "redo", label: "Redo" },
  ],
  [
    { action: "h1", label: "Heading 1" },
    { action: "h2", label: "Heading 2" },
    { action: "h3", label: "Heading 3" },
  ],
  [
    { action: "bold", label: "Bold" },
    { action: "italic", label: "Italic" },
    { action: "strike", label: "Strikethrough" },
    { action: "code", label: "Inline code" },
    { action: "link", label: "Link" },
  ],
  [
    { action: "bulletList", label: "Bulleted list" },
    { action: "orderedList", label: "Numbered list" },
    { action: "taskList", label: "Task list" },
    { action: "quote", label: "Quote" },
    { action: "codeBlock", label: "Code block" },
  ],
  [
    { action: "table", label: "Insert table" },
    { action: "image", label: "Insert image" },
    { action: "footnote", label: "Insert footnote" },
    { action: "mathInline", label: "Inline math" },
    { action: "mathBlock", label: "Math block" },
    { action: "rule", label: "Horizontal rule" },
    { action: "lineBreak", label: "Line break" },
    { action: "properties", label: "Insert properties" },
  ],
];
