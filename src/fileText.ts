// How a document's text is written back to its file: with the file's own line endings, final line
// breaks and byte order mark, and only when the edits change the file.

const BOM = "﻿";

export type FileFormat = { eol: "\n" | "\r\n"; finalBreaks: number; bom: boolean };

/** The line endings (the more common kind if mixed, LF without any), final line breaks and BOM of `text`. */
export function fileFormat(text: string): FileFormat {
  const crlf = text.match(/\r\n/g)?.length ?? 0;
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
  const finalBreaks = text.match(/(?:\r?\n)*$/)![0].replace(/\r/g, "").length;
  return { eol: crlf > lf ? "\r\n" : "\n", finalBreaks, bom: text.startsWith(BOM) };
}

/** The Markdown the editor loads for a file's text: without the byte order mark. */
export const editorText = (text: string) => (text.startsWith(BOM) ? text.slice(BOM.length) : text);

/** Markdown from the editor, as the file stores it: `format`'s line endings, final line breaks and BOM. */
export function toFileText(markdown: string, format: FileFormat) {
  const body = editorText(markdown).replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const breaks = body ? format.finalBreaks : 0;
  return (format.bom ? BOM : "") + (body + "\n".repeat(breaks)).replace(/\n/g, format.eol);
}

/**
 * The text to write for edits made to the file text `original`, or undefined when there is nothing to
 * write: no edits, or edits that leave the file as it is.
 */
export function textToSave(original: string, edited: string | undefined) {
  if (edited === undefined) return undefined;
  const text = toFileText(edited, fileFormat(original));
  return text === original ? undefined : text;
}
