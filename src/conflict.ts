// What a change on disk means for a document that may be open in the editor or have unsaved edits.

export type DiskChange = "none" | "conflict" | "reloadEditor";

/**
 * `disk` is the file's new text and `base` the text the open editor or the unsaved edits started from.
 * Unsaved edits made to an older version conflict with the change; an editor without edits shows an
 * old version and loads the new one.
 */
export function diskChange({ disk, base, edited, editorOpen }: { disk: string; base: string; edited: boolean; editorOpen: boolean }): DiskChange {
  if (disk === base) return "none";
  if (edited) return "conflict";
  return editorOpen ? "reloadEditor" : "none";
}
