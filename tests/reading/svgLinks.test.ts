// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { linkTarget } from "@/reading/svgLinks";

afterEach(() => {
  document.body.innerHTML = "";
});

// What Mermaid draws, with securityLevel "strict", for `click A "https://example.com/x"` and for a `javascript:`
// target (checked in the browser): a link keeps its xlink:href, an unsafe one loses it.
const DRAWING =
  '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a id="web" xlink:href="https://example.com/x"><g><text>A</text></g></a><a id="bare"><g><text>B</text></g></a></svg>';

test("the target of a link reads href or xlink:href", () => {
  document.body.innerHTML = DRAWING + '<a id="plain" href="a.md"><b>x</b></a><i>no link</i>';
  expect(linkTarget(document.querySelector("#web text")!)).toBe("https://example.com/x");
  expect(linkTarget(document.querySelector("#bare text")!)).toBe("");
  expect(linkTarget(document.querySelector("#plain b")!)).toBe("a.md");
  expect(linkTarget(document.querySelector("i")!)).toBeUndefined();
});
