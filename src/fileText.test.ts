import { describe, expect, it } from "vitest";
import { editorText, fileFormat, textToSave, toFileText } from "./fileText";

describe("fileFormat", () => {
  it("finds line endings, final line breaks and a byte order mark", () => {
    expect(fileFormat("a\r\nb\r\n")).toEqual({ eol: "\r\n", finalBreaks: 1, bom: false });
    expect(fileFormat("a\nb")).toEqual({ eol: "\n", finalBreaks: 0, bom: false });
    expect(fileFormat("﻿a\n\n\n")).toEqual({ eol: "\n", finalBreaks: 3, bom: true });
    expect(fileFormat("a\r\n\r\n")).toEqual({ eol: "\r\n", finalBreaks: 2, bom: false });
    expect(fileFormat("single line")).toEqual({ eol: "\n", finalBreaks: 0, bom: false });
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
});
