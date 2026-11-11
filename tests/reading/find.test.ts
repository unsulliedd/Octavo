// @vitest-environment jsdom
import { expect, test } from "vitest";
import {
  compileQuery,
  findInBlocks,
  findMatches,
  findRanges,
  firstVisible,
  matchLabel,
  matchText,
  NO_OPTIONS,
  replacement,
  stepIndex,
  textPieces,
  type FindOptions,
  type Query,
} from "@/reading/find";

/** The compiled search, failing the test on an error or nothing to find. */
function q(query: string, options: Partial<FindOptions> = {}): Query {
  const compiled = compileQuery(query, { ...NO_OPTIONS, ...options });
  if (!compiled || "error" in compiled) throw new Error(`no query for ${query}`);
  return compiled;
}
const texts = (text: string, query: Query, limit?: number) => matchText(text, query, limit).map((m) => m[0]);

test("plain text ignores case, folding Turkish and German letters as before", () => {
  expect(findMatches(["Markdown and markdown, MARKDOWN"], q("markdown")).map((m) => [m.start, m.end])).toEqual([
    [
      [0, 0],
      [0, 8],
    ],
    [
      [0, 13],
      [0, 21],
    ],
    [
      [0, 23],
      [0, 31],
    ],
  ]);
  expect(findMatches(["İstanbul, ISTANBUL"], q("istanbul"))).toHaveLength(2);
  expect(findMatches(["the İzmir office"], q("izmir office"))).toHaveLength(1);
  expect(findMatches(["istanbul"], q("İSTANBUL"))).toHaveLength(1);
  expect(findMatches(["ılık"], q("ilik"))).toHaveLength(0);
  expect(findMatches(["Straße"], q("STRASSE"))).toHaveLength(0);
  expect(texts("a.b axb", q("a.b"))).toEqual(["a.b"]);
  expect(texts("price $4.99 (each)", q("$4.99 (each)"))).toEqual(["$4.99 (each)"]);
});

test("findMatches spans inline formatting but not blocks", () => {
  // "Read **fast** now" renders as three text nodes in one paragraph.
  const [span] = findMatches(["Read ", "fast", " now"], q("d fast n"));
  expect([span.start, span.end]).toEqual([
    [0, 3],
    [2, 2],
  ]);
  expect(findMatches(["Read ", "fast", " now"], q("fast")).map((m) => [m.start, m.end])).toEqual([
    [
      [1, 0],
      [1, 4],
    ],
  ]);
  expect(findMatches(["end", "start"], q("endstart"))).toHaveLength(1);
  expect(findMatches(["end", "start"], q("endstart"), new Set([1]))).toHaveLength(0);
  expect(findMatches(["a", "", "b"], q("ab")).map((m) => [m.start, m.end])).toEqual([
    [
      [0, 0],
      [2, 1],
    ],
  ]);
  // A later block's offsets count from that block's first piece.
  expect(findMatches(["one", "two ", "three"], q("three"), new Set([1])).map((m) => [m.start, m.end])).toEqual([
    [
      [2, 0],
      [2, 5],
    ],
  ]);
});

test("whitespace in a plain query matches any whitespace; nothing to find is undefined", () => {
  expect(texts("two\n  words", q("two words"))).toEqual(["two\n  words"]);
  expect(texts("two words", q("  two   words "))).toEqual(["two words"]);
  expect(compileQuery("   ", NO_OPTIONS)).toBeUndefined();
  expect(compileQuery("", { ...NO_OPTIONS, regex: true })).toBeUndefined();
});

test("Match case and Whole word", () => {
  expect(texts("Word word WORD", q("word", { matchCase: true }))).toEqual(["word"]);
  expect(texts("cat catalog concat cat_s cat.", q("cat", { wholeWord: true }))).toEqual(["cat", "cat"]);
  // Letters of any script, digits and marks are part of a word.
  expect(texts("çat cat2 ça", q("ça", { wholeWord: true }))).toEqual(["ça"]);
  expect(texts("a|b ab", q("a|b", { regex: true, wholeWord: true }))).toEqual(["a", "b"]);
});

test("regular expressions: JavaScript syntax, case from Match case", () => {
  expect(texts("a1 B22 c333", q("[a-z]\\d+", { regex: true }))).toEqual(["a1", "B22", "c333"]);
  expect(texts("a1 B22 c333", q("[a-z]\\d+", { regex: true, matchCase: true }))).toEqual(["a1", "c333"]);
  expect(texts("😀x😀", q("\\p{Emoji_Presentation}", { regex: true }))).toEqual(["😀", "😀"]);
  // ^ and $ are the start and end of each block.
  expect(findInBlocks(["one two", "two one"], q("^two", { regex: true })).map((h) => h.block)).toEqual([1]);
  expect(findInBlocks(["a\nb"], q("a.b", { regex: true }))).toHaveLength(0);
});

test("an invalid pattern gives a short error and never throws", () => {
  expect(compileQuery("(", { ...NO_OPTIONS, regex: true })).toEqual({ error: "Unterminated group" });
  expect(compileQuery("a: [", { ...NO_OPTIONS, regex: true })).toEqual({ error: expect.not.stringContaining("/") });
  expect(compileQuery("*", { ...NO_OPTIONS, regex: true, wholeWord: true })).toEqual({ error: expect.any(String) });
  // The same text as plain text is fine.
  expect(texts("f(x", q("("))).toEqual(["("]);
});

test("empty matches are stepped over: no endless loop, no hits", () => {
  for (const pattern of ["^", "$", "\\b", "x*", "(?=a)", "|"]) expect(texts("aaa bbb", q(pattern, { regex: true }))).toEqual([]);
  expect(texts("😀😀", q("x*", { regex: true }))).toEqual([]);
  expect(texts("xx a xxx", q("x*", { regex: true }))).toEqual(["xx", "xxx"]);
  expect(texts("ab", q("a?", { regex: true }))).toEqual(["a"]);
});

test("the limit caps the matches, across blocks too", () => {
  const line = "a ".repeat(5000);
  expect(matchText(line, q("a"), 1000)).toHaveLength(1000);
  const blocks = Array.from({ length: 50 }, () => "a a a");
  expect(findInBlocks(blocks, q("a"), 101)).toHaveLength(101);
  expect(findInBlocks(blocks, q("a")).pop()).toMatchObject({ block: 49 });
});

test("a pattern that backtracks badly stays within its block", () => {
  // `(a+)+$` fails slowly on a run of "a" that doesn't end its text; per block the runs stay short.
  const blocks = Array.from({ length: 2000 }, () => "aaaaaaaaaaaab");
  const started = performance.now();
  expect(findInBlocks(blocks, q("(a+)+$", { regex: true }), 1001)).toHaveLength(0);
  expect(performance.now() - started).toBeLessThan(2000);
  // Matches that are found stop at the limit, so the search ends however many blocks follow.
  expect(findInBlocks(Array.from({ length: 100000 }, () => "aa"), q("(a+)+$", { regex: true }), 1001)).toHaveLength(1001);
});

test("replacement: literal as plain text, $ references with a regular expression", () => {
  const [m] = matchText("John Smith", q("(\\w+) (?<last>\\w+)", { regex: true }));
  expect(replacement("$2, $1", m, true)).toBe("Smith, John");
  expect(replacement("$<last>!", m, true)).toBe("Smith!");
  expect(replacement("[$&]", m, true)).toBe("[John Smith]");
  expect(replacement("$$1 costs $$", m, true)).toBe("$1 costs $");
  expect(replacement("$2, $1", m, false)).toBe("$2, $1");
  // As String.prototype.replace: a group that doesn't exist stays as written; $10 is $1 then 0.
  expect(replacement("$3 $0 $10 $01", m, true)).toBe("$3 $0 John0 John");
  expect(replacement("$<nope>|$<last", m, true)).toBe("|$<last");
  expect(replacement("x", m, true)).toBe("x");
  const [plain] = matchText("ab", q("(a)|(z)", { regex: true }));
  expect(replacement("[$2]", plain, true)).toBe("[]");
  expect(replacement("$<x>", plain, true)).toBe("$<x>");
  expect("John Smith".replace(/(\w+) (?<last>\w+)/, "$3 $0 $10 $01")).toBe("$3 $0 John0 John");
});

test("stepping wraps around and the label counts from one, with + past the limit", () => {
  expect(stepIndex(0, 1, 3)).toBe(1);
  expect(stepIndex(2, 1, 3)).toBe(0);
  expect(stepIndex(0, -1, 3)).toBe(2);
  expect(stepIndex(0, 1, 0)).toBe(-1);
  expect(matchLabel(1, 7)).toBe("2 of 7");
  expect(matchLabel(0, 1000, true)).toBe("1 of 1000+");
  expect(matchLabel(-1, 0)).toBe("No results");
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
  expect(findRanges(root, q("now")).map((r) => r.range.toString())).toEqual(["now", "now", "now"]);
  expect(findRanges(root, q("now")).map((r) => r.from)).toEqual([0, 1, 2]);
  expect(findRanges(root, q("copy"))).toHaveLength(1);
  const [{ range: span }] = findRanges(root, q("d fast n"));
  expect(span.toString()).toBe("d fast n");
  expect(span.startContainer.textContent).toBe("Read ");
  expect(span.endContainer.textContent).toBe(" now");
  expect(findRanges(root, q("now now"))).toHaveLength(0);
  expect(findRanges(root, q("n\\w+", { regex: true }), 2).map((r) => r.range.toString())).toEqual(["now", "now"]);
});
