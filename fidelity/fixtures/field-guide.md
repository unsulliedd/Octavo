# A field guide to Markdown

Markdown is a way of writing plain text that reads well as it is and turns into a formatted document when a program shows it. This guide walks through the parts of Markdown that everyday documents use: notes, project plans, meeting minutes, READMEs and long-form writing. It is ordinary prose with lists, tables and a little code, the kind of document people keep for years.

**Audience:** anyone who writes documents in a text editor  
**Length:** about twenty minutes of reading  
**Format:** Markdown, with GitHub Flavored Markdown tables and task lists

---

## 1. Why plain text

A document written in plain text belongs to its author. It opens in any editor on any computer, today and in twenty years. It can be compared line by line, kept in version control, searched with ordinary tools and backed up as a single small file. Nothing about it depends on one company's program staying on the market.

Markdown adds just enough structure on top of plain text to make a document pleasant to read once it is formatted: headings, emphasis, lists, links, tables and code. The marks are chosen so that the raw text still reads naturally. A heading starts with a hash sign, a list item with a dash, and emphasis is wrapped in asterisks, much as people wrote in plain-text email long before Markdown existed.

The trade-off is that Markdown is not a page-layout language. It says what a piece of text is, not exactly how it looks. A heading is a heading; the program showing it decides its font and size. For most documents that is a feature: the writing stays the same while the way it is shown can change.

### 1.1 What this guide covers

- Paragraphs, line breaks and emphasis
- Headings and how to structure a long document
- Lists, nested lists and task lists
- Links, images and footnotes
- Tables and when to use them
- Code, quotes and horizontal rules
- Habits that keep documents easy to maintain

### 1.2 What it leaves out

Extensions that only some programs understand, such as diagrams, math and custom containers, are mentioned only briefly. They are useful, but a document that relies on them is less portable.

---

## 2. Paragraphs and line breaks

A paragraph is one or more lines of text separated from the next paragraph by a blank line. Single line breaks inside a paragraph are joined into one line when the document is shown, so a writer can wrap long paragraphs in the editor without changing the result.

That joining surprises people who expect every line break to show. When a line break matters, as in an address or a poem, end the line with two spaces or a backslash:

Octavo Example Office  
12 Paper Street  
Riverton

Two spaces are invisible in most editors, which makes them easy to lose. A backslash at the end of the line does the same job and can be seen.\
Many writers prefer it for that reason.

### 2.1 Emphasis

Wrap text in single asterisks or underscores for *emphasis* and in double asterisks for **strong emphasis**. Use them sparingly. A paragraph where every other phrase is bold has no emphasis at all, because nothing stands out from anything else.

Strikethrough, written with two tildes on each side, marks text as ~~removed~~ while keeping it visible. It is handy in plans and changelogs, where it is useful to see what was dropped.

### 2.2 Inline code

Wrap commands, file names, function names and anything a reader might copy in backticks: `git status`, `README.md`, `parseDate()`. Inline code is shown in a monospaced font and its contents are never formatted, so underscores and asterisks inside it stay as they are.

---

## 3. Headings and structure

Headings start with one to six hash signs followed by a space. One hash is the document's title, two are its main sections, three are subsections, and so on. Most documents need only three levels; a document that needs five usually wants to be split.

A good heading tells the reader what the section is about, not how it fits into the document. "Installing on Windows" is more useful than "Step 2". Readers jump around long documents through their headings, and an outline built from vague headings is no help.

### 3.1 One idea per section

Each section should answer one question. When a section starts answering a second question, give that question its own heading. Short sections with clear headings are easier to read, easier to link to and easier to update than long ones.

### 3.2 Order

Put what most readers need first. A README starts with what the project does and how to install it; history, design notes and contributor rules come later. Meeting notes start with decisions and actions, not with who arrived first.

### 3.3 Numbering

Numbered headings, such as the ones in this guide, help when people refer to sections in conversation: "see 4.2". They cost some upkeep, because inserting a section means renumbering the ones after it. For documents that change often, plain headings and links work better.

---

## 4. Lists

A dash, an asterisk or a plus sign at the start of a line begins a bulleted list. A number followed by a period begins a numbered list. The numbers themselves barely matter: most programs number the items in order, starting from the first number written.

- Bulleted lists suit items without an order
- Numbered lists suit steps and rankings
- Keep the items parallel: all nouns, or all sentences that start with a verb

1. Open the document
2. Make the change
3. Read it once more as a reader would
4. Save it

### 4.1 Nested lists

Indent an item to nest it under the one above. Nested lists are useful for outlines but become hard to read past two levels.

- Planning
  - Goals for the quarter
  - Risks and how to spot them early
- Delivery
  - Weekly check-ins
  - A short written summary at the end of each month

### 4.2 Task lists

GitHub Flavored Markdown adds task lists: a bulleted list whose items start with a box, `[ ]` for open and `[x]` for done. They turn a document into a lightweight checklist.

- [x] Draft the outline
- [x] Write the first three sections
- [ ] Ask two people to read it
- [ ] Publish it

### 4.3 Lists with paragraphs

An item can hold more than one paragraph. Indent the following paragraphs to line up with the item's text, and leave a blank line between them.

1. Gather the material.

   Collect notes, links and earlier versions in one folder before writing. It is easier to leave things out than to go looking for them halfway through.

2. Write a rough draft in one sitting.

   Do not edit while drafting. The goal is to get every idea down in some form.

3. Edit in a second pass, with fresh eyes.

---

## 5. Links and images

A link is written as the link text in square brackets followed by the address in parentheses: [the CommonMark specification](https://spec.commonmark.org/). The text should say where the link goes. "Click here" tells a reader nothing, especially one who scans a page for its links.

Links can also point to other documents in the same folder, such as [the changelog](changelog.md), or to a heading in the same document, such as [the section on tables](#6-tables).

### 5.1 Reference links

For a paragraph with many links, or a link used several times, reference links keep the text readable. The text holds a short label in brackets, and the address is defined once, anywhere in the document:

The [Markdown guide][guide] and the [GFM specification][gfm] both describe tables.

[guide]: https://www.markdownguide.org/
[gfm]: https://github.github.com/gfm/

### 5.2 Images

An image is a link with an exclamation mark in front. The text in brackets is the alternative text, read aloud by screen readers and shown when the image cannot be loaded. Write it as if describing the image to someone who cannot see it.

![A diagram of the three steps: draft, edit, publish](img/octavo.svg)

Keep images in a folder next to the document, such as `img/` or `assets/`, and link them with relative paths. The document and its images can then move together.

### 5.3 Footnotes

Footnotes keep asides out of the main text.[^1] The note itself is written anywhere in the document and shown at the end.

[^1]: Like this one. Use footnotes for sources and side remarks, not for anything the reader needs to follow the argument.

---

## 6. Tables

Tables are written with pipes between the cells and a row of dashes under the header. They are part of GitHub Flavored Markdown rather than the original syntax, but nearly every program supports them now.

| Element | Syntax | Notes |
| --- | --- | --- |
| Heading | `# Title` | One to six hash signs |
| Emphasis | `*text*` | Underscores work too |
| Strong | `**text**` | |
| Link | `[text](address)` | Relative paths for local files |
| Image | `![alt](path)` | Always write the alt text |
| Code | `` `code` `` | Backticks |

### 6.1 Alignment

Colons in the dash row set the alignment of a column: on the left for left-aligned, on the right for right-aligned, on both sides for centered. Numbers read best right-aligned.

| Month | Visitors | Change |
| :--- | ---: | :---: |
| January | 1,204 | — |
| February | 1,388 | +15% |
| March | 1,951 | +41% |
| April | 1,730 | −11% |

### 6.2 When not to use a table

Tables suit data with the same fields in every row. They are a poor fit for long text: a cell cannot hold paragraphs or lists, and wide tables are hard to read on small screens. When the cells start holding sentences, a list of short sections usually reads better.

---

## 7. Code

For more than a line of code, use a fenced block: a line of three backticks, the code, and another line of three backticks. Write the language after the opening backticks so the code can be highlighted.

```python
def word_count(text: str) -> int:
    """Counts the words in a piece of plain text."""
    return len(text.split())


print(word_count("A field guide to Markdown"))
```

```bash
git add notes.md
git commit -m "Add meeting notes"
```

Code blocks keep their text exactly as written: spaces, line breaks and all. That makes them the right place for configuration files, terminal output and anything else where whitespace matters.

```json
{
  "title": "A field guide to Markdown",
  "sections": 9,
  "draft": false
}
```

---

## 8. Quotes and rules

A greater-than sign at the start of a line makes a block quote. Quotes are for text someone else wrote, or for setting a passage apart.

> Write the way you talk, then edit until it reads the way you wish you talked.
>
> Short sentences carry most of the meaning. Long ones carry the rest.

A line with three dashes and nothing else draws a horizontal rule. Rules separate the major parts of a long document, as in this guide. Use them where the topic changes, not between every section.

---

## 9. Habits that keep documents healthy

A document that lives for years changes many times, often by different people. A few habits keep it easy to read and easy to change.

### 9.1 One sentence per line, or not

Some writers put each sentence on its own line. The document looks the same when shown, because single line breaks are joined, but changes show up more clearly in version control: editing one sentence changes one line. Others prefer paragraphs on one line each, which reads better in plain editors. Either works; mixing both in one document does not.

### 9.2 Consistent marks

Pick one bullet character, one emphasis character and one heading style, and use them everywhere. Mixed styles do not change how the document looks, but they make the source harder to read and comparisons noisier.

| Choice | Common pick | Why |
| --- | --- | --- |
| Bullets | `-` | Easy to type, clear in plain text |
| Emphasis | `*text*` or `_text_` | Either, as long as it is one |
| Strong | `**text**` | Underscores inside words can confuse some programs |
| Headings | `#` style | The underlined style only has two levels |
| Rules | `---` | |

### 9.3 Dates and versions

Write dates as year-month-day, such as 2026-03-14. They sort correctly, read the same in every country and leave no doubt about which number is the month. Give versions the same care: say which version a note applies to, so a reader can tell whether it is still true.

### 9.4 Small files

Several short documents linked together are easier to maintain than one huge one. A project might keep its README, a changelog, a contributing guide and a folder of design notes, each with one clear purpose. The links between them do the work a table of contents would do in a single long file.

### 9.5 Review before publishing

Read the formatted document once before sharing it. Broken links, a list that turned into a paragraph, or a table missing its dash row are easy to miss in the source and obvious once shown.

---

## 10. A sample meeting note

The structure below works for most meetings. Decisions and actions come first, because they are what people look for later.

### Weekly planning, 2026-03-14

**Present:** Ada, Grace, Linus, Margaret  
**Notes by:** Grace

#### Decisions

1. The spring release moves to the first week of May, to leave two weeks for testing.
2. Documentation for the new import feature is written before the feature is merged, not after.
3. The old export format stays supported for one more release.

#### Actions

- [ ] Ada: update the release plan and the public roadmap
- [ ] Linus: write the import guide, with screenshots
- [ ] Margaret: check which customers still use the old export format
- [x] Grace: send these notes to the team

#### Discussion

The team agreed that the last release was rushed. Two bugs reached users that a second round of testing would have caught, and both took longer to fix after release than they would have before it. Moving the date costs two weeks now and should save more than that later.

Linus raised the question of whether the import feature needs its own settings page. The group decided to start with sensible defaults and add settings only when users ask for them, since every setting is something to document, test and support.

---

## 11. A sample project README

A README answers four questions in order: what is this, how do I install it, how do I use it, and where do I go next.

### Example

**Notebook** keeps plain-text notes in a folder of your choosing and makes them searchable.

#### Install

Download the latest release and run the installer, or build it yourself:

```bash
git clone https://example.com/notebook.git
cd notebook
make install
```

#### Use

1. Choose a folder for your notes.
2. Write notes as Markdown files in that folder, with any editor.
3. Search them from the command line:

```bash
notebook search "release plan"
```

#### Next steps

- Read the [user guide](docs/guide.md) for tags and links between notes
- See the [changelog](CHANGELOG.md) for what changed in each release
- Report problems on the issue tracker

---

## 12. Glossary

| Term | Meaning |
| --- | --- |
| CommonMark | A precise specification of core Markdown, so different programs show the same text the same way |
| GFM | GitHub Flavored Markdown: CommonMark plus tables, task lists, strikethrough and autolinks |
| Front matter | A block of metadata at the top of a file, between two lines of three dashes |
| Fenced code | A code block opened and closed by three backticks or tildes |
| Alt text | The description of an image, read by screen readers |
| Relative path | An address measured from the current file, such as `img/photo.png` |

---

## 13. Further reading

- [CommonMark](https://commonmark.org/), the specification and a ten-minute tutorial
- [GitHub Flavored Markdown](https://github.github.com/gfm/), the extensions most programs support
- [The Markdown Guide](https://www.markdownguide.org/), a friendly reference with examples

The best way to learn Markdown is to write in it. Start with notes nobody else will read, look at them formatted from time to time, and the marks become second nature within a week.
