// @vitest-environment jsdom
import { expect, test } from "vitest";
import { domHtml, sameRendering } from "./sameRendering";

test("whitespace that never renders and attribute spelling don't count", () => {
  expect(sameRendering("<p>a</p>\n<p>b</p>", "<p>a</p><p>b</p>")).toBe(true);
  expect(sameRendering("<table>\n<tr>\n<td>1</td>\n</tr>\n</table>", "<table><tr><td>1</td></tr></table>")).toBe(true);
  expect(sameRendering("<a data-x>y</a>", '<a data-x="">y</a>')).toBe(true);
});

test("visible differences count", () => {
  expect(sameRendering("<p>a b</p>", "<p>a  b</p>")).toBe(false);
  expect(sameRendering("<p><b>a</b> <i>b</i></p>", "<p><b>a</b><i>b</i></p>")).toBe(false); // the space shows
  expect(sameRendering("<pre>x\n  y</pre>", "<pre>x\ny</pre>")).toBe(false);
  expect(sameRendering("<p>a</p>", "<p>a</p><p>b</p>")).toBe(false);
  expect(domHtml("<p>x</p>\n<details><summary>s</summary>t</details>")).toBe("<p>x</p><details><summary>s</summary>t</details>");
});
