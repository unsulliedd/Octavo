import { expect, test } from "vitest";
import gfm from "../../fidelity/fixtures/gfm.md?raw";
import { escapePasses, escapeStrayDollars, joinPath, parseMarkdown, render, resolveLocal } from "@/reading/render";
import { longDocs } from "../support/longDocs";

const toUrl = (p: string) => `asset:${p}`;

test("joinPath normalizes and keeps the root", () => {
  expect(joinPath("C:\\docs\\a", "../img/x.png")).toBe("C:\\docs\\img\\x.png");
  expect(joinPath("C:\\docs", "../../../x.png")).toBe("C:\\x.png");
  expect(joinPath("/home/u/docs", "./img/x.png")).toBe("/home/u/docs/img/x.png");
});

test("resolveLocal leaves URLs alone and maps local paths", () => {
  expect(resolveLocal("/d", "https://x.org/a.png", toUrl)).toBe("https://x.org/a.png");
  expect(resolveLocal("/d", "data:image/png;base64,AA", toUrl)).toBe("data:image/png;base64,AA");
  expect(resolveLocal("/d", "img/my%20pic.png?v=1", toUrl)).toBe("asset:/d/img/my pic.png");
  expect(resolveLocal("/d", "C:\\pics\\a.png", toUrl)).toBe("asset:C:\\pics\\a.png");
});

test("render: GFM, frontmatter, local images, sanitizing, math", async () => {
  const html = await render(
    [
      "---",
      "title: Shown",
      "tags: [a, 'b c']",
      "---",
      "## My Heading",
      "",
      "| a |",
      "|---|",
      "| b |",
      "",
      "- [x] done",
      "",
      "![i](img/a.png)",
      "",
      '<script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">x</a>',
      "",
      "$e=mc^2$",
    ].join("\n"),
    "/d",
    toUrl,
  );
  expect(html).toContain('<dl class="doc-properties" aria-label="Properties"><dt>title</dt><dd>Shown</dd><dt>tags</dt><dd><span class="property-chip">a</span><span class="property-chip">b c</span></dd></dl>');
  expect(html).toContain('<h2 id="my-heading">');
  expect(html).toContain("<table>");
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('src="asset:/d/img/a.png"');
  expect(html).not.toMatch(/<script|javascript:|onclick/);
  expect(html).toContain('class="katex"');
});

test("code blocks: highlighting, language label, copy button, Mermaid untouched", async () => {
  const html = await render(
    ["```cs", "public class Unit { int hp = 10; }", "```", "", "```", "no language", "```", "", "```mermaid", "flowchart LR", "  A --> B", "```"].join("\n"),
    "/d",
    toUrl,
  );
  expect(html).toContain('class="hljs-keyword"');
  expect(html).toContain('<span class="code-lang">C#</span>');
  expect(html.match(/class="code-copy"/g)).toHaveLength(2); // C# and the unnamed block, not Mermaid
  expect(html).toMatch(/<pre><code class="language-mermaid">flowchart LR/);
  expect(html).not.toMatch(/<pre><code class="hljs[^"]*">no language/);
});

test("escapeStrayDollars keeps prices as text and real math as math", async () => {
  const esc = escapeStrayDollars;
  expect(esc(String.raw`$0.89 / 100 gems, $2.97 / 600 gems`)).toBe(String.raw`\$0.89 / 100 gems, $2.97 / 600 gems`); // a lone `$` is already text
  expect(esc(String.raw`costs $5,$6 total`)).toBe(String.raw`costs \$5,$6 total`);
  expect(esc(String.raw`$5 for $x^2$`)).toBe(String.raw`\$5 for $x^2$`);
  expect(esc(String.raw`$4.99 or $9.99 and $x$`)).toBe(String.raw`\$4.99 or \$9.99 and $x$`);
  for (const keep of [String.raw`$x$ and $y$`, String.raw`$$x$$ inline`, "`$a $` code", "| $0,99 | $4,99 |\n|---|---|\n| a | b |"]) {
    expect(esc(keep)).toBe(keep);
  }
  const katexCount = async (md: string) => ((await render(md, "/d", toUrl)).match(/class="katex"/g) ?? []).length;
  expect(await katexCount("Packs: $0.89 / ... $2.97 each")).toBe(0);
  expect(await katexCount(String.raw`$5 for $x^2$ and $e^{i\pi}$`)).toBe(2);
});

test("footnote and other in-document links point at ids that exist", async () => {
  const html = await render(`${gfm}\n[To the table](#gfm) <a id="raw">raw anchor</a> [to raw](#raw)\n`, "/d", toUrl);
  const ids = new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/\shref="#([^"]*)"/g)].map((m) => decodeURIComponent(m[1]));
  expect(targets).toEqual(expect.arrayContaining(["user-content-fn-1", "user-content-fnref-1", "user-content-fn-note", "user-content-fnref-note", "gfm", "user-content-raw"]));
  for (const target of targets) expect(ids, `#${target}`).toContain(target);
  expect(html).not.toContain("user-content-user-content-");
  expect(html).toContain('aria-describedby="user-content-footnote-label"');
});

test("parseMarkdown returns the tree of the escaped source and leaves frontmatter alone", () => {
  const front = "---\nprice: $5 or $6\n---\n";
  expect(escapeStrayDollars(front)).toBe(front);
  const { md, tree } = parseMarkdown("Packs: $0.89 / ... $2.97 each, and $x$");
  expect(md).toBe(String.raw`Packs: \$0.89 / ... \$2.97 each, and $x$`);
  const types = JSON.stringify(tree, (key, value) => (key === "position" ? undefined : value));
  expect(types.match(/"inlineMath"/g)).toHaveLength(1);
});

test("raw HTML is sanitized with or without rehype-raw", async () => {
  expect(await render("a < b and **c**", "/d", toUrl)).toBe("<p>a &#x3C; b and <strong>c</strong></p>");
  expect(await render("x <kbd>Ctrl</kbd> <img src=x onerror=alert(1)>", "/d", toUrl)).toBe('<p>x <kbd>Ctrl</kbd> <img src="asset:/d/x" data-src="x"></p>');
});

test("table cells are marked short or long by their text", async () => {
  const html = await render(
    ["| n | Notes |", "|---|---|", "| 12 | Each lost assault leaves the army intact and adds a free hand |", "| `x2_single_chance` | 0.05 |"].join("\n"),
    "/d",
    toUrl,
  );
  expect(html).toContain('<th class="cell-short">n</th>');
  expect(html).toContain('<td class="cell-long">Each lost assault');
  expect(html).toContain('<td class="cell-short"><code>x2_single_chance</code></td>');
  expect(html.match(/cell-(short|long)/g)).toHaveLength(6);
  expect(html).toMatch(/^<div class="table-scroll"><table>[\s\S]*<\/table><\/div>$/);
});

test("long inline code breaks at separators, short code and code blocks stay as written", async () => {
  const html = await render(
    ["`Assets/Hooligan/LevelSystem/VirtualChapterSystem.cs` `a/b.c` `../../Packages::Name` $a_b/c.d_e/f.g_h$", "", "```", "Assets/Hooligan/LevelSystem/VirtualChapterSystem.cs", "```"].join("\n"),
    "/d",
    toUrl,
  );
  expect(html).toContain("<code>Assets/<wbr>Hooligan/<wbr>LevelSystem/<wbr>VirtualChapterSystem<wbr>.cs</code>");
  expect(html).toContain("<code>a/b.c</code>");
  expect(html).toContain("<code>../../<wbr>Packages::<wbr>Name</code>");
  expect(html).toContain("<pre><code>Assets/Hooligan/LevelSystem/VirtualChapterSystem.cs\n</code></pre>");
  expect(html).toContain('class="katex"');
  expect(html.match(/<wbr>/g)).toHaveLength(6);
});

test("long URLs shown as link text break at separators", async () => {
  const html = await render("See https://example.com/docs/guide/index.html?page=2&sort=asc and [a short link](https://example.com/very/long/path/here).", "/d", toUrl);
  expect(html).toContain(">https://<wbr>example<wbr>.com/<wbr>docs/<wbr>guide/<wbr>index<wbr>.html<wbr>?page<wbr>=2<wbr>&#x26;sort<wbr>=asc</a>");
  expect(html).toContain(">a short link</a>");
  expect(html).toContain('href="https://example.com/docs/guide/index.html?page=2&#x26;sort=asc"');
});

test("local images are reported to toUrl with their full path and keep their source in data-src", async () => {
  const seen: string[] = [];
  const html = await render("![a](../img/a.png) ![b](https://example.com/b.png) ![c](sub/c%20d.png)", "/docs/notes", (p) => (seen.push(p), `asset:${p}`));
  expect(seen).toEqual(["/docs/img/a.png", "/docs/notes/sub/c d.png"]);
  expect(html).toContain('src="asset:/docs/img/a.png"');
  expect(html).toContain('data-src="../img/a.png"');
  expect(html).toContain('src="https://example.com/b.png" alt="b" data-src="https://example.com/b.png"');
});

test("images with an absolute drive path survive the sanitizer, in Markdown and in raw HTML", async () => {
  const asked: string[] = [];
  const track = (p: string) => (asked.push(p), toUrl(p));
  const html = await render(
    ["![a](C:/pics/a.png)", "", "![b](C:\\pics\\b.png)", "", '<img src="C:\\pics\\c.png" alt="c"> <img src="d:/pics/my pic.png">', "", "![e](<C:/pics/my pic.png>)"].join("\n"),
    "/d",
    track,
  );
  expect(html).toContain('src="asset:C:/pics/a.png"');
  expect(html).toContain('src="asset:C:\\pics\\b.png"');
  expect(html).toContain('src="asset:C:\\pics\\c.png"');
  expect(html).toContain('src="asset:d:/pics/my pic.png"');
  expect(html).toContain('data-src="C:/pics/a.png"');
  expect(asked.map((p) => p.replace(/\\/g, "/"))).toEqual(["C:/pics/a.png", "C:/pics/b.png", "C:/pics/c.png", "d:/pics/my pic.png", "C:/pics/my pic.png"]);
});

test("the sanitizer still drops every other scheme from an image source", async () => {
  const asked: string[] = [];
  const html = await render(
    ['<img src="javascript:alert(1)"><img src="file:///C:/x.png"><img src="ab:/x.png"><img src="C:x.png">'].join("\n"),
    "/d",
    (p) => (asked.push(p), toUrl(p)),
  );
  expect(html).not.toMatch(/src=/);
  expect(asked).toEqual([]);
});

test("an inline png, jpeg, gif or webp image keeps its source, in Markdown and in <img>", async () => {
  const srcs = ["data:image/png;base64,AA", "data:image/jpeg;base64,AA", "data:image/gif;base64,AA", "data:image/webp;base64,AA", "data:Image/PNG;base64,AA", "data:image/png;charset=utf-8;base64,AA", "data:image/png,AA"];
  for (const src of srcs) {
    expect(await render(`<img src="${src}">`, "/d", toUrl)).toContain(`src="${src}"`);
    expect(await render(`![p](${src})`, "/d", toUrl)).toContain(`src="${src}"`);
  }
});

test("every other data: source stays dropped, in any letter case and with any parameters", async () => {
  const srcs = [
    "data:image/svg+xml;base64,AA",
    "data:image/svg+xml,%3Csvg%3E",
    "DATA:IMAGE/SVG+XML;base64,AA",
    "data:image/svg+xml;charset=utf-8,x",
    "data:text/html;base64,AA",
    "data:text/html,<script>1</script>",
    "data:application/javascript,1",
    "data:image/pngx;base64,AA",
    "data:image/png+xml;base64,AA",
    "data:image/bmp;base64,AA",
    "data:,AA",
    "data:image/png",
    " data:image/png;base64,AA",
  ];
  for (const src of srcs) {
    expect(await render(`<img src="${src}">`, "/d", toUrl), src).not.toMatch(/src=/);
    expect(await render(`![p](<${src}>)`, "/d", toUrl), src).not.toMatch(/src=/);
  }
});

test("only an image's src keeps a data: value", async () => {
  const html = await render('<a href="data:image/png;base64,AA">x</a><img srcset="data:image/png;base64,AA 1x" longdesc="data:image/png;base64,AA">', "/d", toUrl);
  expect(html).not.toContain("data:");
});

test("a large inline image renders quickly, and so does a large refused one", async () => {
  const big = "A".repeat(1_000_000);
  for (const [src, kept] of [[`data:image/png;base64,${big}`, true], [`data:image/svg+xml;base64,${big}`, false], [`data:image/png;${"image/".repeat(160_000)}`, true]] as const) {
    const started = performance.now();
    const html = await render(`![p](${src})`, "/d", toUrl);
    expect(html.includes("src=")).toBe(kept);
    expect(performance.now() - started).toBeLessThan(5000); // a backtracking pattern would take minutes
  }
}, 20_000);

test("a <source srcset> is mapped like an image, descriptors kept, and the local files reach toUrl", async () => {
  const asked: string[] = [];
  const html = await render(
    [
      "<picture>",
      '<source media="(prefers-color-scheme: dark)" srcset="img/dark.png 1x, img/dark@2x.png 2x">',
      '<source srcset="C:/pics/w.png 480w, https://x.org/r.png 800w">',
      '<img src="img/light.png" alt="p">',
      "</picture>",
    ].join("\n"),
    "/d",
    (p) => (asked.push(p), toUrl(p)),
  );
  expect(html).toContain('srcset="asset:/d/img/dark.png 1x, asset:/d/img/dark@2x.png 2x"');
  expect(html).toContain('media="(prefers-color-scheme: dark)"');
  expect(html).toContain('srcset="asset:C:/pics/w.png 480w, https://x.org/r.png 800w"');
  expect(asked).toEqual(["/d/img/dark.png", "/d/img/dark@2x.png", "C:/pics/w.png", "/d/img/light.png"]);
});

test("an image on another server stays blocked through a <source srcset>", async () => {
  const asked: string[] = [];
  const html = await render(
    '<picture><source srcset="//other/share/a.png 1x, //server/share/b.png 2x"><img src="x.png"></picture>',
    "\\\\server\\share\\docs",
    (p) => (asked.push(p), toUrl(p)),
  );
  expect(html).toContain('srcset="//other/share/a.png 1x, asset:\\\\server\\share\\b.png 2x"');
  expect(asked).toEqual(["\\\\server\\share\\b.png", "\\\\server\\share\\docs\\x.png"]);
});

// parseMarkdown escapes block by block; escapePasses runs the same passes over the whole document.
const sameAsWholePasses = (md: string) => {
  const fast = parseMarkdown(md);
  const whole = escapePasses(md);
  expect(fast.md).toBe(whole.md);
  expect(JSON.stringify(fast.tree)).toBe(JSON.stringify(whole.tree));
};

test.each(Object.keys(longDocs))("parseMarkdown escapes the long %s document as the whole-document passes do", (name) => {
  sameAsWholePasses(longDocs[name]);
});

test.each([
  ["a price before real math", "$5 for $x^2$ and $3 more.\n\nNext $y$ here.\n"],
  ["prices in list items, quotes and nested lists", "- $5 and $6\n  - $7, $8 and $9\n\n> $1 or $2 or $3\n> > $4 $5\n"],
  ["prices in table cells", "| a | b |\n|---|---|\n| $3.50 | $4 and $5 |\n| $x$ | $1 $2 $3 |\n"],
  ["a setext heading and a footnote", "Costs $5 and $6\n===\n\nSee[^1].\n\n[^1]: $7 and $8 then $z$\n"],
  ["reference links defined elsewhere", '[$5 and $6][ref] then $7 and $8\n\n[ref]: https://example.com "$9 $10"\n'],
  ["code, display math and HTML", "`$5 $6` and $7 $8\n\n$$\na $5\n$$\n\n<div>$1 and $2</div>\n\n```\n$3 $4\n```\n"],
  ["frontmatter", "---\nprice: $5 and $6\n---\n\n$1 and $2 and $x$\n"],
  ["Windows line endings", "Costs $5 and $6\r\n\r\n| a |\r\n|---|\r\n| $1 $2 |\r\n"],
  ["escaped and doubled dollars", "\\$5 and $$ and $6 $ 7$ and $a$1\n"],
  ["more bad spans in one paragraph than the passes cover", Array.from({ length: 60 }, (_, i) => `$${i}`).join(" ") + "\n\nThen $5 and $6.\n"],
])("parseMarkdown escapes %s as the whole-document passes do", (_, md) => {
  sameAsWholePasses(md);
});
