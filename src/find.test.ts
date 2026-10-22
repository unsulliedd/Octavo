// @vitest-environment jsdom
import { expect, test } from "vitest";
import { findMatches, findRanges, firstVisible, matchLabel, queryPattern, stepIndex, textPieces } from "./find";

test("findMatches is case-insensitive and finds every occurrence", () => {
  expect(findMatches(["Markdown and markdown, MARKDOWN"], "markdown")).toEqual([
    { start: [0, 0], end: [0, 8] },
    { start: [0, 13], end: [0, 21] },
    { start: [0, 23], end: [0, 31] },
  ]);
  expect(findMatches(["İstanbul, ISTANBUL"], "istanbul")).toEqual([
    { start: [0, 0], end: [0, 8] },
    { start: [0, 10], end: [0, 18] },
  ]);
  expect(findMatches(["the İzmir office"], "izmir office")).toEqual([{ start: [0, 4], end: [0, 16] }]);
  expect(findMatches(["istanbul"], "İSTANBUL")).toHaveLength(1);
  expect(findMatches(["ılık"], "ilik")).toHaveLength(0);
  expect(findMatches(["Straße"], "STRASSE")).toHaveLength(0);
  expect(findMatches(["a.b axb"], "a.b")).toEqual([{ start: [0, 0], end: [0, 3] }]);
  expect(findMatches(["price $4.99 (each)"], "$4.99 (each)")).toHaveLength(1);
});

test("findMatches spans inline formatting but not blocks", () => {
  // "Read **fast** now" renders as three text nodes in one paragraph.
  expect(findMatches(["Read ", "fast", " now"], "d fast n")).toEqual([{ start: [0, 3], end: [2, 2] }]);
  expect(findMatches(["Read ", "fast", " now"], "fast")).toEqual([{ start: [1, 0], end: [1, 4] }]);
  expect(findMatches(["end", "start"], "endstart")).toHaveLength(1);
  expect(findMatches(["end", "start"], "endstart", new Set([1]))).toHaveLength(0);
  expect(findMatches(["a", "", "b"], "ab")).toEqual([{ start: [0, 0], end: [2, 1] }]);
});

test("whitespace in the query matches any whitespace", () => {
  expect(findMatches(["two\n  words"], "two words")).toHaveLength(1);
  expect(findMatches(["two words"], "  two   words ")).toHaveLength(1);
  expect(queryPattern("   ")).toBeUndefined();
  expect(findMatches(["anything"], "")).toEqual([]);
});

test("stepping wraps around and the label counts from one", () => {
  expect(stepIndex(0, 1, 3)).toBe(1);
  expect(stepIndex(2, 1, 3)).toBe(0);
  expect(stepIndex(0, -1, 3)).toBe(2);
  expect(stepIndex(0, 1, 0)).toBe(-1);
  expect(matchLabel(1, 7, "x")).toBe("2 of 7");
  expect(matchLabel(-1, 0, "x")).toBe("No results");
  expect(matchLabel(-1, 0, " ")).toBe("");
});

test("firstVisible starts at the first match in view", () => {
  expect(firstVisible([10, 200, 900], 150)).toBe(1);
  expect(firstVisible([10, 200], 1000)).toBe(0);
  expect(firstVisible([], 0)).toBe(-1);
});

test("textPieces and findRanges work on the rendered DOM and skip hidden math and code headers", () => {
  const root = document.createElement("article");
  root.innerHTML = [
    "<p>Read <strong>fast</strong> now</p>",
    "<p>now again</p>",
    '<div class="code-block"><div class="code-head"><span>Text</span><button>Copy</button></div><pre><code>copy now</code></pre></div>',
    '<p><span class="katex"><span class="katex-mathml"><math><mi>now</mi></math></span><span class="katex-html">x</span></span></p>',
  ].join("");
  const { nodes, breaks } = textPieces(root);
  expect(nodes.map((n) => n.data)).toEqual(["Read ", "fast", " now", "now again", "copy now", "x"]);
  expect([...breaks]).toEqual([0, 3, 4, 5]);
  expect(findRanges(root, "now").map((r) => r.toString())).toEqual(["now", "now", "now"]);
  expect(findRanges(root, "copy")).toHaveLength(1);
  const [span] = findRanges(root, "d fast n");
  expect(span.toString()).toBe("d fast n");
  expect(span.startContainer.textContent).toBe("Read ");
  expect(span.endContainer.textContent).toBe(" now");
  expect(findRanges(root, "now now")).toHaveLength(0);
});
