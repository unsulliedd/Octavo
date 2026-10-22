import { expect, test } from "vitest";
import { headingsOf, sourceParser } from "./sourceMarkdown";

const headings = (text: string) => headingsOf(sourceParser.parse(text), text);

test("headings in the source, as the outline shows them", () => {
  const text = "# Title #\n\nText\n\nSub *part* `code`\n---\n\n> ## In a [quote](q.md)\n\n```\n# not a heading\n```\n";
  expect(headings(text)).toEqual([
    { level: 1, text: "Title", from: 0 },
    { level: 2, text: "Sub part code", from: 17 },
    { level: 2, text: "In a quote", from: text.indexOf("## In") },
  ]);
});

test("frontmatter is not read as a heading", () => {
  expect(headings("---\ntitle: T\n---\n\n# Real\n")).toEqual([{ level: 1, text: "Real", from: 18 }]);
  // Without a closing line, the rest is frontmatter.
  expect(headings("---\ntitle: T\n# Not\n")).toEqual([]);
  // Only on the first line.
  expect(headings("Text\n---\n")).toEqual([{ level: 2, text: "Text", from: 0 }]);
});
