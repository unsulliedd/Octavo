// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { arrange, exportPath, fileTitle, inlineUrls, localImages, pageHtml, woff2Only } from "@/export/exportPage";
import { render } from "@/reading/render";

const BASE = "http://asset.localhost/";
const toUrl = (path: string) => BASE + encodeURIComponent(path);

/** The document rendered as the reading view renders it, laid out for export. */
async function exported(md: string, path = "C:\\docs\\Rendering notes.md") {
  const article = document.createElement("article");
  article.innerHTML = await render(md, "C:\\docs", toUrl);
  const title = arrange(article, fileTitle(path), BASE);
  const blocks = [...article.children].map((el) => (el.className ? `${el.tagName.toLowerCase()}.${el.className}` : el.tagName.toLowerCase()));
  return { article, title, blocks };
}

describe("names", () => {
  test("the title is the file name without its extension, as written", () => {
    expect(fileTitle("C:\\docs\\Rendering notes.md")).toBe("Rendering notes");
    expect(fileTitle("/home/a/release-notes.v2.markdown")).toBe("release-notes.v2");
    expect(fileTitle("C:\\docs\\README")).toBe("README");
    expect(fileTitle("C:\\docs\\.notes")).toBe(".notes");
  });

  test("the suggested file sits next to the document with .html or .pdf", () => {
    expect(exportPath("C:\\docs\\Rendering notes.md", "html")).toBe("C:\\docs\\Rendering notes.html");
    expect(exportPath("C:\\a.b\\notes.markdown", "pdf")).toBe("C:\\a.b\\notes.pdf");
    expect(exportPath("/home/a/README", "pdf")).toBe("/home/a/README.pdf");
  });
});

describe("pageHtml", () => {
  test("is one page with its styles, the escaped title and the document in the reading column", () => {
    const page = pageHtml('A <b> & "c"', "<p>x</p>", "p{color:red}");
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toContain("<title>A &lt;b&gt; &amp; &quot;c&quot;</title>");
    expect(page).toContain("<style>p{color:red}</style>");
    expect(page).toContain('<div class="doc-column"><article class="doc"><p>x</p></article></div>');
  });
});

describe("styles", () => {
  test("each font keeps only its woff2 file", () => {
    const css =
      '@font-face{font-family:A;src:url(/f/A.woff2) format("woff2"),url(/f/A.woff) format("woff"),url(/f/A.ttf) format("truetype");font-weight:400}' +
      "@font-face{font-family:B;src:url(/f/B.ttf) format('truetype')}";
    expect(woff2Only(css)).toBe('@font-face{font-family:A;src:url(/f/A.woff2) format("woff2");font-weight:400}@font-face{font-family:B;src:url(/f/B.ttf) format(\'truetype\')}');
  });

  test("every URL is loaded once and put in as data; data URLs and failures stay", async () => {
    const asked: string[] = [];
    const css = 'a{src:url(/f/A.woff2)} b{background:url("/i/b.png")} c{mask:url("data:image/svg+xml,%3Csvg stroke=\'x\'%3E")} d{src:url(\'/f/A.woff2\')} e{src:url(/gone.woff2)}';
    const out = await inlineUrls(css, async (url) => {
      asked.push(url);
      if (url === "/gone.woff2") throw new Error("404");
      return `data:x;base64,${url.length}`;
    });
    expect(asked.sort()).toEqual(["/f/A.woff2", "/gone.woff2", "/i/b.png"]);
    expect(out).toBe('a{src:url(data:x;base64,10)} b{background:url(data:x;base64,8)} c{mask:url("data:image/svg+xml,%3Csvg stroke=\'x\'%3E")} d{src:url(data:x;base64,10)} e{src:url(/gone.woff2)}');
  });

  test("a long line of URL-like text without a closing parenthesis is scanned quickly", async () => {
    const css = "url(" + "a".repeat(200_000);
    const start = performance.now();
    expect(await inlineUrls(css, async () => "data:")).toBe(css);
    expect(woff2Only("src:" + "url(".repeat(50_000))).toContain("src:");
    const many = "url(".repeat(50_000);
    expect(await inlineUrls(many, async () => "data:")).toBe(many);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("arrange", () => {
  test("a document without a top heading gets the file name as its title, then properties and Contents", async () => {
    const { article, title, blocks } = await exported("---\nstatus: Review\ntags: [a, b]\n---\n\nIntro.\n\n## How a page is drawn\n\n### Code blocks\n\n## Formulas\n\n##### Deep\n");
    expect(title).toBe("Rendering notes");
    expect(blocks.slice(0, 4)).toEqual(["h1", "dl.doc-properties", "nav.doc-contents", "p"]);
    expect(article.querySelector("h1")!.textContent).toBe("Rendering notes");
    const links = [...article.querySelectorAll(".doc-contents li")].map((li) => [li.getAttribute("data-level"), li.querySelector("a")!.getAttribute("href"), li.textContent]);
    expect(links).toEqual([
      ["2", "#how-a-page-is-drawn", "How a page is drawn"],
      ["3", "#code-blocks", "Code blocks"],
      ["2", "#formulas", "Formulas"],
    ]);
    expect(article.querySelector(".doc-contents h2")!.textContent).toBe("Contents");
  });

  test("a document that starts with its own top heading keeps it as the title, above the properties", async () => {
    const { title, blocks } = await exported("---\nstatus: Review\n---\n\n# The *real* title\n\nText.\n\n## One\n");
    expect(title).toBe("The real title");
    expect(blocks.slice(0, 4)).toEqual(["h1", "dl.doc-properties", "nav.doc-contents", "p"]);
  });

  test("without properties or headings, the title is followed by the document", async () => {
    const { blocks } = await exported("# Only a title\n\nText.\n");
    expect(blocks).toEqual(["h1", "p"]);
    expect((await exported("Just text.\n")).blocks).toEqual(["h1", "p"]);
  });

  test("a top heading further down is not the title", async () => {
    const { title, blocks } = await exported("Intro.\n\n# Later\n");
    expect(title).toBe("Rendering notes");
    expect(blocks).toEqual(["h1", "p", "h1"]);
  });

  test("Copy buttons go, task boxes can't be ticked, and local image paths are dropped", async () => {
    const { article } = await exported("```js\nx()\n```\n\n- [x] done\n- [ ] open\n\n![dot](img/dot.png) ![web](https://example.com/w.png)\n");
    expect(article.querySelector(".code-copy")).toBeNull();
    expect(article.querySelector(".code-lang")!.textContent).toBe("JavaScript");
    expect(article.querySelector("input")).toBeNull();
    const boxes = [...article.querySelectorAll(".task-list-item > .task-box")];
    expect(boxes.map((b) => [b.getAttribute("aria-label"), b.hasAttribute("data-checked")])).toEqual([
      ["Done", true],
      ["Not done", false],
    ]);
    expect(article.querySelector("[data-src]")).toBeNull();
    const imgs = localImages(article, BASE);
    expect([...imgs.keys()]).toEqual(["C:\\docs\\img\\dot.png"]);
    expect(article.querySelector('img[alt="web"]')!.getAttribute("src")).toBe("https://example.com/w.png");
  });
});
