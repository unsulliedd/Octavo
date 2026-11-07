import { describe, expect, it } from "vitest";
import { editedText, editorText, eolLabel, fileFormat, textToSave, toFileText } from "@/files/fileText";

describe("fileFormat", () => {
  it("handles any run of blank lines in the middle of a file at once", () => {
    const text = `a${"\r\n".repeat(50_000)}b\r\n`;
    expect(fileFormat(text).finalBreaks).toBe(1);
    expect(textToSave(text, `a${"\n".repeat(50_000)}c\n`)).toBe(`a${"\r\n".repeat(50_000)}c\r\n`);
  });

  it("finds line endings, final line breaks and a byte order mark", () => {
    expect(fileFormat("a\r\nb\r\n")).toEqual({ eol: "\r\n", mixed: false, finalBreaks: 1, bom: false });
    expect(fileFormat("a\nb")).toEqual({ eol: "\n", mixed: false, finalBreaks: 0, bom: false });
    expect(fileFormat("﻿a\n\n\n")).toEqual({ eol: "\n", mixed: false, finalBreaks: 3, bom: true });
    expect(fileFormat("a\r\n\r\n")).toEqual({ eol: "\r\n", mixed: false, finalBreaks: 2, bom: false });
    expect(fileFormat("single line")).toEqual({ eol: "\n", mixed: false, finalBreaks: 0, bom: false });
  });

  it("uses the more common line ending in a mixed file", () => {
    expect(fileFormat("a\r\nb\r\nc\n").eol).toBe("\r\n");
    expect(fileFormat("a\nb\nc\r\n").eol).toBe("\n");
  });
});

describe("toFileText", () => {
  it("writes the file's line endings and final line breaks", () => {
    const crlf = fileFormat("# T\r\n\r\ntext\r\n");
    expect(toFileText("# T\n\nnew text\n", crlf)).toBe("# T\r\n\r\nnew text\r\n");
    expect(toFileText("# T\n\nnew\n\n\n", fileFormat("x"))).toBe("# T\n\nnew");
    expect(toFileText("a\n", fileFormat("x\n\n"))).toBe("a\n\n");
  });

  it("keeps line breaks inside code blocks and normalizes stray CRLF from the editor", () => {
    expect(toFileText("```\ncode\n\n\nmore\n```\n", fileFormat("x\r\n"))).toBe("```\r\ncode\r\n\r\n\r\nmore\r\n```\r\n");
    expect(toFileText("a\r\nb\n", fileFormat("x\n"))).toBe("a\nb\n");
  });

  it("keeps the byte order mark", () => {
    const original = "﻿# T\r\n";
    expect(editorText(original)).toBe("# T\r\n");
    expect(toFileText("# New\n", fileFormat(original))).toBe("﻿# New\r\n");
    expect(toFileText("# New\n", fileFormat("# T\n"))).toBe("# New\n");
  });
});

describe("textToSave", () => {
  it("writes nothing without edits", () => {
    expect(textToSave("# T\r\n", undefined)).toBeUndefined();
  });

  it("writes nothing when the edits leave the file as it is", () => {
    expect(textToSave("# T\r\n\r\ntext\r\n", "# T\n\ntext\n")).toBeUndefined();
    expect(textToSave("﻿a\n", "a\n")).toBeUndefined();
  });

  it("writes edits in the file's format", () => {
    expect(textToSave("# T\r\n\r\ntext\r\n", "# T\n\nmore text\n")).toBe("# T\r\n\r\nmore text\r\n");
    expect(textToSave("# T", "# T2\n")).toBe("# T2");
  });

  it("keeps the line ending of each line the edits left alone in a mixed file", () => {
    const original = "# T\r\n\r\nfirst\nsecond\r\n\nlast\n";
    expect(textToSave(original, "# T\n\nfirst\nsecond\n\nlast\n")).toBeUndefined();
    expect(textToSave(original, "# T\n\nfirst\nsecond\n\nchanged\n")).toBe("# T\r\n\r\nfirst\nsecond\r\n\nchanged\n");
    expect(textToSave(original, "# Title\n\nfirst\nadded\nsecond\n\nlast\n")).toBe("# Title\r\n\r\nfirst\nadded\nsecond\r\n\nlast\n");
  });

  it("keeps lone carriage returns as line endings", () => {
    expect(fileFormat("a\rb\r")).toEqual({ eol: "\r", mixed: false, finalBreaks: 1, bom: false });
    expect(textToSave("a\r\rb\r", "a\n\nb\n")).toBeUndefined();
    expect(textToSave("a\r\rb\r", "a\n\nc\n")).toBe("a\r\rc\r");
    expect(textToSave("a\r\nb\rc\n", "a\nb\nd\n")).toBe("a\r\nb\rd\n");
  });

  it("keeps a final line without a line ending and the byte order mark in a mixed file", () => {
    expect(textToSave("﻿a\r\nb\nc", "a\nb\nd\n")).toBe("﻿a\r\nb\nd");
  });
});

describe("editedText", () => {
  it("is the file's format even when the edits change nothing", () => {
    expect(editedText("a\r\nb\n", "a\nb\n")).toBe("a\r\nb\n");
    expect(editedText("a\r\n", "a\nb\n")).toBe("a\r\nb\r\n");
  });
});

it("names a file's line endings for the status bar, mixed or not", () => {
  const label = (text: string) => eolLabel(fileFormat(text));
  expect(label("a\nb\n")).toBe("LF");
  expect(label("no break")).toBe("LF");
  expect(label("a\r\nb\r\n")).toBe("CRLF");
  expect(label("a\rb\rc")).toBe("CR");
  expect(label("a\r\nb\r\nc\n")).toBe("CRLF (mixed)");
  expect(label("a\nb\nc\r\n")).toBe("LF (mixed)");
  expect(label("a\rb\rc\n")).toBe("CR (mixed)");
});
