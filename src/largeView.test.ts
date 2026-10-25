// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { addOpenButtons, buttonLeft, cycleFocus, fileName, headingBefore, imageTitle, largeContent, tableMarkup, uniqueIds } from "./largeView";

function article(html: string) {
  const root = document.createElement("article");
  root.className = "doc";
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const state = { editing: false, selecting: false, click: true };
const SVG = '<svg id="mermaid-1" viewBox="0 0 200 100"><style>#mermaid-1 .a{fill:red}</style><g><path id="mermaid-1_arrow"/><use href="#mermaid-1_arrow"/></g></svg>';

test("the title of a table or diagram is the nearest heading above it", () => {
  const root = article("<h1>Doc</h1><h2>Results <em>so far</em></h2><p>x</p><table></table><h2>Later</h2><div class='mermaid'></div>");
  expect(headingBefore(root, root.querySelector("table")!, "Table")).toBe("Results so far");
  expect(headingBefore(root, root.querySelector(".mermaid")!, "Diagram")).toBe("Later");
});

test("a table or diagram before every heading is titled with the fallback", () => {
  const root = article("<table></table><h2>After</h2>");
  expect(headingBefore(root, root.querySelector("table")!, "Table")).toBe("Table");
  expect(headingBefore(article("<h2> </h2><table></table>"), document.querySelectorAll("table")[1], "Table")).toBe("Table");
});

test("an image is titled by its alt text, else its file name, else Image", () => {
  expect(imageTitle(" Sales chart ", "a/b.png")).toBe("Sales chart");
  expect(imageTitle("", "../img/chart%20v2.png?x=1")).toBe("chart v2.png");
  expect(imageTitle("", "C:\\pics\\a.png")).toBe("a.png");
  expect(imageTitle("", "data:image/png;base64,AAAA")).toBe("Image");
  expect(imageTitle("", "")).toBe("Image");
  expect(fileName("https://example.com/x/logo.svg#top")).toBe("logo.svg");
});

test("a copy of a diagram gets its own ids, and every reference to them follows", () => {
  const copy = uniqueIds(SVG, "large");
  expect(copy).toContain('id="mermaid-1-large"');
  expect(copy).toContain("#mermaid-1-large .a");
  expect(copy).toContain('id="mermaid-1-large_arrow"');
  expect(copy).toContain('href="#mermaid-1-large_arrow"');
  expect(copy).not.toMatch(/mermaid-1(?!-large)/);
});

test("renaming ids leaves similar ids and markup without an id alone", () => {
  expect(uniqueIds('<svg id="m-1"><path id="m-12"/></svg>', "x")).toBe('<svg id="m-1-x"><path id="m-12"/></svg>');
  expect(uniqueIds('<svg viewBox="0 0 1 1"></svg>', "x")).toBe('<svg viewBox="0 0 1 1"></svg>');
});

test("a table is copied without its resize handles and hand-set widths", () => {
  const root = article(
    '<div class="table-scroll"><table class="sized" style="width: 20em"><thead><tr><th style="width: 10em">A<span class="col-resize"></span></th><th style="width: 10em">B<span class="col-resize"></span></th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></div>',
  );
  const html = tableMarkup(root.querySelector("table")!);
  expect(html).not.toContain("col-resize");
  expect(html).not.toContain("sized");
  expect(html).not.toContain("width");
  expect(html).toContain("<td>1</td>");
  // The document's own table is untouched.
  expect(root.querySelector("table")!.className).toBe("sized");
  expect(root.querySelectorAll(".col-resize")).toHaveLength(2);
});

test("a click on a diagram opens it, titled by its heading", () => {
  const root = article(`<h2>Flow</h2><div class="mermaid">${SVG}</div>`);
  const content = largeContent(root.querySelector("path")!, root, state);
  expect(content).toMatchObject({ kind: "diagram", title: "Flow" });
  expect(content && "markup" in content && content.markup).toContain('id="mermaid-1-large"');
  expect(root.querySelector("svg")!.id).toBe("mermaid-1");
});

test("a diagram that failed to draw has nothing to open", () => {
  const root = article('<div class="mermaid">flowchart LR\n A --> </div>');
  expect(largeContent(root.querySelector(".mermaid")!, root, state)).toBeUndefined();
});

test("a click on an image opens it; an image inside a link does not", () => {
  const root = article('<p><img src="asset:/d/a.png" data-src="img/a.png" alt="Alt text"></p><p><a href="x.md"><img src="asset:/d/b.png" data-src="b.png" alt="Badge"></a></p>');
  const [plain, linked] = root.querySelectorAll("img");
  expect(largeContent(plain, root, state)).toMatchObject({ kind: "image", title: "Alt text", alt: "Alt text" });
  expect(largeContent(linked, root, state)).toBeUndefined();
});

test("an image without alt text is titled by the file name from the document's source", () => {
  const root = article('<img src="http://asset.localhost/C%3A%5Cdocs%5Cimg%5Cmap.png" data-src="img/map.png">');
  expect(largeContent(root.querySelector("img")!, root, state)).toMatchObject({ title: "map.png" });
});

test("nothing opens while editing, and a diagram or image doesn't open while text is selected", () => {
  const root = article(`<img src="a.png" alt="A"><div class="mermaid">${SVG}</div>`);
  const img = root.querySelector("img")!;
  expect(largeContent(img, root, { ...state, editing: true })).toBeUndefined();
  expect(largeContent(img, root, { ...state, selecting: true })).toBeUndefined();
  expect(largeContent(root.querySelector("g")!, root, { ...state, selecting: true })).toBeUndefined();
});

test("a plain click on a table or its text opens nothing", () => {
  const root = article('<h2>Data</h2><div class="table-scroll"><table><tr><td>cell</td></tr></table></div><p>text</p>');
  expect(largeContent(root.querySelector("td")!, root, state)).toBeUndefined();
  expect(largeContent(root.querySelector("p")!, root, state)).toBeUndefined();
});

test("the table's button opens that table, titled by its heading", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const root = article(
    '<h2>One</h2><div class="table-scroll"><table><tr><td>a</td></tr></table></div><h2>Two</h2><div class="table-scroll"><table><tr><td>b</td></tr></table></div>',
  );
  addOpenButtons(root, false);
  const buttons = root.querySelectorAll<HTMLButtonElement>(".large-open");
  expect(buttons).toHaveLength(2);
  const content = largeContent(buttons[1].querySelector("path")!, root, state);
  expect(content).toMatchObject({ kind: "table", title: "Two" });
  expect(content && "markup" in content && content.markup).toContain("<td>b</td>");
  expect(largeContent(buttons[1], root, { ...state, editing: true })).toBeUndefined();
});

test("table buttons are labelled, added once and removed again", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const root = article('<div class="table-scroll"><table><tr><td>a</td></tr></table></div>');
  const remove = addOpenButtons(root, false);
  addOpenButtons(root, false);
  const button = root.querySelector<HTMLButtonElement>(".large-open")!;
  expect(root.querySelectorAll(".large-open")).toHaveLength(1);
  expect(button.getAttribute("aria-label")).toBe("Open the table large");
  expect(button.title).toBe("Open large");
  expect(button.querySelector("path")!.getAttribute("d")).toBe("M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7");
  remove();
  expect(root.querySelector(".large-open")).toBeNull();
});

test("with the click option off, a click on a diagram or image opens nothing", () => {
  const root = article(`<img src="a.png" alt="A"><div class="mermaid">${SVG}</div>`);
  const off = { ...state, click: false };
  expect(largeContent(root.querySelector("img")!, root, off)).toBeUndefined();
  expect(largeContent(root.querySelector("g")!, root, off)).toBeUndefined();
});

test("diagrams and images get open buttons too, and the buttons open them", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const root = article(`<h2>Flow</h2><div class="mermaid">${SVG}</div><p>Text <img src="a.png" alt="Chart"> more</p><p><a href="x.md"><img src="b.png" alt="Badge"></a></p>`);
  addOpenButtons(root, true);
  const [diagramButton, imageButton, ...rest] = root.querySelectorAll<HTMLButtonElement>(".large-open");
  expect(rest).toHaveLength(0); // the linked image gets none
  expect(diagramButton.getAttribute("aria-label")).toBe("Open the diagram large");
  expect(imageButton.getAttribute("aria-label")).toBe("Open the image large");
  const off = { ...state, click: false };
  expect(largeContent(diagramButton, root, off)).toMatchObject({ kind: "diagram", title: "Flow" });
  expect(largeContent(imageButton.querySelector("svg")!, root, off)).toMatchObject({ kind: "image", title: "Chart" });
  expect(largeContent(imageButton, root, { ...state, selecting: true })).toMatchObject({ kind: "image" });
});

test("without the media buttons only tables get one, and removing them leaves the images as they were", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const html = `<div class="mermaid">${SVG}</div><p>Text <img src="a.png" alt="Chart"> more</p>`;
  const root = article(html);
  const before = root.innerHTML;
  addOpenButtons(root, false);
  expect(root.querySelectorAll(".large-open, .large-frame")).toHaveLength(0);
  const remove = addOpenButtons(root, true);
  addOpenButtons(root, true);
  expect(root.querySelectorAll(".large-frame")).toHaveLength(1);
  expect(root.querySelectorAll(".large-open")).toHaveLength(2);
  remove();
  expect(root.innerHTML).toBe(before);
});

test("the table button sits at the table's right edge, or the visible right edge of a wide table", () => {
  expect(buttonLeft(300, 800, 0)).toBe(266);
  expect(buttonLeft(1400, 800, 0)).toBe(766);
  expect(buttonLeft(1400, 800, 200)).toBe(966);
  expect(buttonLeft(1400, 800, 600)).toBe(1366);
  expect(buttonLeft(20, 800, 0)).toBe(6);
});

test("Tab cycles through the panel's controls", () => {
  expect(cycleFocus(3, 0, false)).toBe(1);
  expect(cycleFocus(3, 2, false)).toBe(0);
  expect(cycleFocus(3, 0, true)).toBe(2);
  expect(cycleFocus(3, -1, false)).toBe(0);
  expect(cycleFocus(3, -1, true)).toBe(2);
  expect(cycleFocus(0, -1, false)).toBe(-1);
});
