import { expect, test } from "vitest";
import gfm from "../fidelity/fixtures/gfm.md?raw";
import { escapeStrayDollars, joinPath, parseMarkdown, render, resolveLocal } from "./render";

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
