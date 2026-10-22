import { expect, test } from "vitest";
import { blocks, markdownStyle, parseBlocks, preserveUnchanged } from "./preserve";

// Written by hand, in styles the editor normalizes: setext heading, `*` bullets, `|---|` delimiter row,
// extra blank lines, a reference link.
const original = `Title
=====

* one
* two



| a | b |
|---|---|
| 1 | 2 |

See [the site][site] for more.

Last paragraph.

[site]: https://example.com
`;

// The same document as the editor writes it.
const normalized = `# Title

- one
- two

| a | b |
| - | - |
| 1 | 2 |

See [the site](https://example.com) for more.

Last paragraph.
`;

test("a document without edits is written exactly as it was", () => {
  expect(preserveUnchanged(original, normalized)).toBe(original);
});

test("an edited block is written by the editor, every other block is kept", () => {
  const edited = normalized.replace("Last paragraph.", "Last paragraph, edited.");
  expect(preserveUnchanged(original, edited)).toBe(original.replace("Last paragraph.", "Last paragraph, edited."));
});

test("an edited table keeps its unchanged rows and delimiter row", () => {
  const table = "|Unit|Cost|\n|---|---:|\n|Archer|5|\n|Knight|9|\n";
  const editor = "| Unit | Cost |\n| - | -: |\n| Archer | 5 |\n| Knight | 9 |\n";
  expect(preserveUnchanged(table, editor.replace("| 5 |", "| 6 |"))).toBe("|Unit|Cost|\n|---|---:|\n| Archer | 6 |\n|Knight|9|\n");
  // Added and removed rows.
  expect(preserveUnchanged(table, editor.replace("| Archer | 5 |\n", "| Archer | 5 |\n| Mage | 7 |\n"))).toBe(
    "|Unit|Cost|\n|---|---:|\n|Archer|5|\n| Mage | 7 |\n|Knight|9|\n",
  );
  expect(preserveUnchanged(table, editor.replace("| Knight | 9 |\n", ""))).toBe("|Unit|Cost|\n|---|---:|\n|Archer|5|\n");
  // A changed header or alignment comes from the editor.
  expect(preserveUnchanged(table, editor.replace("| Unit |", "| Name |"))).toBe("| Name | Cost |\n|---|---:|\n|Archer|5|\n|Knight|9|\n");
  expect(preserveUnchanged(table, editor.replace("| - | -: |", "| :-: | -: |"))).toBe("|Unit|Cost|\n| :-: | -: |\n|Archer|5|\n|Knight|9|\n");
});

test("a table edited by the editor keeps the blocks around it", () => {
  const edited = normalized.replace("| 1 | 2 |", "| 1 | 3 |");
  const result = preserveUnchanged(original, edited);
  expect(result).toContain("| a | b |\n|---|---|\n| 1 | 3 |");
  expect(result).toContain("Title\n=====\n\n* one\n* two");
});

test("table rows of a result are where the result has them", () => {
  const edited = normalized.replace("Last paragraph.", "Changed.");
  const result = preserveUnchanged(original, edited);
  const table = blocks(result)!.find((b) => b.table)!.table!;
  const fresh = parseBlocks(result.replace(/\n+$/, ""))!.find((b) => b.table)!.table!;
  expect(table).toEqual(fresh);
});

test("added and removed blocks", () => {
  const added = normalized.replace("Last paragraph.", "New paragraph.\n\nLast paragraph.");
  expect(preserveUnchanged(original, added)).toBe(original.replace("Last paragraph.", "New paragraph.\n\nLast paragraph."));
  const removed = normalized.replace("Last paragraph.\n", "");
  const result = preserveUnchanged(original, removed);
  expect(result).not.toContain("Last paragraph.");
  expect(result).toContain("See [the site][site] for more.");
  // The definition the kept paragraph uses stays.
  expect(result).toContain("[site]: https://example.com");
});

test("an edited paragraph with a reference link keeps the definition", () => {
  const edited = normalized.replace("for more.", "for details.");
  const result = preserveUnchanged(original, edited);
  expect(result).toContain("See [the site](https://example.com) for details.");
  expect(result).toContain("[site]: https://example.com");
});

test("math with stray dollars matches across the escape the editor adds", () => {
  const md = "Costs $5 and $10.\n\nSum $x^2$.\n";
  const editor = "Costs \\$5 and $10.\n\nSum $x^2$.\n";
  expect(preserveUnchanged(md, editor)).toBe(md);
});

test("the blocks of a result are known without parsing it again", () => {
  const edited = normalized.replace("| 1 | 2 |", "| 1 | 3 |").replace("Last paragraph.", "New one.\n\nLast paragraph.");
  const result = preserveUnchanged(original, edited);
  expect(blocks(result)).toEqual(parseBlocks(result.replace(/\n+$/, "")));
});

test("the style of a file is the characters it uses most", () => {
  expect(markdownStyle("* a\n* b\n\n- c\n\n*x* and **y** and __z__ and __w__\n\n***\n")).toEqual({
    bullet: "*",
    emphasis: "*",
    strong: "_",
    rule: "*",
  });
  expect(markdownStyle("Plain text.\n")).toEqual({ bullet: "-", emphasis: "_", strong: "*", rule: "-" });
  // Ordered lists don't count.
  expect(markdownStyle("1. a\n2. b\n").bullet).toBe("-");
});
