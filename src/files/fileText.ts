// How a document's text is written back to its file: with the file's own line endings, final line
// breaks and byte order mark, and only when the edits change the file.

import { diffLines } from "@/lib/lineDiff";

const BOM = "﻿";
const LINE_END = /\r\n|\r|\n/g;

/** The line breaks `text` ends in. A loop, as a regular expression backtracks on every run of breaks in the text. */
function finalBreaksOf(text: string) {
  let start = text.length;
  while (text[start - 1] === "\n" || text[start - 1] === "\r") start--;
  return text.slice(start);
}

export type Eol = "\n" | "\r\n" | "\r";
export type FileFormat = { eol: Eol; mixed: boolean; finalBreaks: number; bom: boolean };

/** The line endings (the most common kind, LF without any), final line breaks and BOM of `text`. */
export function fileFormat(text: string): FileFormat {
  const counts = new Map<string, number>();
  for (const end of text.match(LINE_END) ?? []) counts.set(end, (counts.get(end) ?? 0) + 1);
  const eol = [...counts].reduce((best, kind) => (kind[1] > best[1] ? kind : best), ["\n", counts.get("\n") ?? 0] as [string, number])[0] as Eol;
  const finalBreaks = finalBreaksOf(text).match(LINE_END)?.length ?? 0;
  return { eol, mixed: counts.size > 1, finalBreaks, bom: text.startsWith(BOM) };
}

/** The status bar's name for a file's line endings: "CRLF", "LF" or "CR", with "(mixed)" when the file uses more than one. */
export const eolLabel = ({ eol, mixed }: FileFormat) => `${{ "\n": "LF", "\r\n": "CRLF", "\r": "CR" }[eol]}${mixed ? " (mixed)" : ""}`;

/** The Markdown the editor loads for a file's text: without the byte order mark. */
export const editorText = (text: string) => (text.startsWith(BOM) ? text.slice(BOM.length) : text);

/** Markdown from the editor, as the file stores it: `format`'s line endings, final line breaks and BOM. */
export function toFileText(markdown: string, format: FileFormat) {
  const body = editorText(markdown).replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const breaks = body ? format.finalBreaks : 0;
  return (format.bom ? BOM : "") + (body + "\n".repeat(breaks)).replace(/\n/g, format.eol);
}

/**
 * `text`'s lines, each with the line ending it or the line it replaces had in `original`, then `original`'s final line
 * breaks. New lines end in `eol`.
 */
function keepLineEnds(original: string, text: string, eol: Eol) {
  const final = finalBreaksOf(original);
  const lines = original.slice(0, original.length - final.length);
  const ends = lines.match(LINE_END) ?? [];
  const after = text.slice(0, text.length - finalBreaksOf(text).length).split(LINE_END);
  const out: string[] = [];
  let added: string[] = [];
  let removed: string[] = [];
  const flush = () => {
    added.forEach((line, n) => out.push(line, removed[n] ?? eol));
    added = [];
    removed = [];
  };
  let i = 0;
  for (const line of diffLines(lines.split(LINE_END), after)) {
    if (line.kind === "del") removed.push(ends[i++]);
    else if (line.kind === "add") added.push(line.text);
    else {
      flush();
      out.push(line.text, ends[i++] ?? eol);
    }
  }
  flush();
  out.pop();
  return out.join("") + final;
}

/**
 * Markdown from the editor as the file `original` stores it. In a file with mixed line endings, lines the edits
 * left alone keep their own.
 */
export function editedText(original: string, markdown: string) {
  const format = fileFormat(original);
  const text = toFileText(markdown, format);
  return format.mixed ? keepLineEnds(original, text, format.eol) : text;
}

/**
 * The text to write for edits made to the file text `original`, or undefined when there is nothing to
 * write: no edits, or edits that leave the file as it is.
 */
export function textToSave(original: string, edited: string | undefined) {
  if (edited === undefined) return undefined;
  const text = editedText(original, edited);
  return text === original ? undefined : text;
}
