# Editor fidelity: Milkdown round trip

How the rich-text editor keeps a Markdown file intact. The question: if a document is opened in the editor and saved, does the file come back unchanged apart from the edits?

`npm run fidelity` opens every document in `fidelity/fixtures/` (committed edge cases) and `fidelity/private/` (gitignored, your own documents) in Milkdown, saves it, and reports changed lines plus a `sameHtml` column: the original and the saved file rendered with the reader and compared as HTML. Compare the output with:

```bash
git diff --no-index fidelity/fixtures fidelity/out/fixtures
```
```bash
git diff --no-index fidelity/private fidelity/out/private
```

## Settings

The editor uses `src/editor/markdown.ts`, and so does the harness:
- `remarkStringifyOptionsCtx`: the bullet, emphasis, strong emphasis and rule characters the file uses most (`markdownStyle` in `src/editor/preserve.ts`), else `bullet: "-", rule: "-", emphasis: "_", strong: "*"`.
- `remarkGFMPlugin.options`: `tablePipeAlign: false`, so table rows aren't re-padded to the widest cell.

## Math and frontmatter

`src/editor/markdown.ts` adds remark-math and remark-frontmatter plus nodes that keep math and frontmatter as raw source, so they round-trip exactly: `\,` in math, `\$5` and the frontmatter come back as written.

## Prices and math

remark-math pairs any two `$`, so `$0.89 / ... $2.97` becomes one formula. `escapeStrayDollars` in `src/render.ts` applies Pandoc's rule before parsing: the content can't start or end with whitespace, and the closing `$` can't be followed by a digit. The reader runs it, and the editor must run it when loading a file. A pair of prices that still satisfies the rule (no space before the second `$`, no digit after it) is read as math, as in Pandoc; write `\$` to keep it text.

With math enabled, every literal `$` in an edited block is saved as `\$`. Same rendering, but noise in diffs.

## What changes in a save

Only the blocks you edit. A save matches the top-level blocks (paragraphs, headings, lists, tables, code blocks) of the file and of the editor's Markdown by content, and copies every unchanged block from the file as it was written, with the text between neighbors (`src/editor/preserve.ts`). In an edited table, rows whose cells didn't change are copied too, and so is the delimiter row while the columns and their alignment stay the same. Link reference definitions stay. The result must still open as the editor's content, or the editor's own Markdown is saved instead. The report's `saveNoEdit`, `saveOneEdit` and `saveCellEdit` columns count the lines a save changes without edits (0 for every test document), after appending to the first paragraph (that paragraph's lines only), and after also appending to the first table cell (one more line).

In an edited block, formatting only, no data loss: setext → ATX headings, reference links inlined, `~~~` and indented code → backtick fences, `+`/`*` bullets → `-`, `3)` ↔ `3.`, table delimiter rows `|---|---|` → `| - | - |` (no option for this), `~` and `[` escaped as `\~` and `\[`, `~x~` → `~~x~~`, bare `www.` autolinks → explicit links, `&copy;` → `©`, hard breaks → `\`, list continuation lines re-indented. `singleTilde: false` does not stop the `\~` escaping.

## Check before editing

Edit mode applies the same test to every document it opens: it renders the Markdown the editor would write and compares it with the reading view (`src/editor/sameRendering.ts`). If they differ, the document opens in Source mode, where its Markdown is edited as text. One known case: inline code containing `|` in a table cell (`` `x|y` ``) is split into two cells.

Before every save, the editor also parses the Markdown it is about to write and compares the result with its content (`snapshot` in `src/editor/session.ts`, the `reopens` column of the report). If the file would open as something else, nothing is written and the save reports an error.
