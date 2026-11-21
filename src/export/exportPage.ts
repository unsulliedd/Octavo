// The exported page: one HTML file that carries everything it shows, and the same page printed to PDF.
// Plain logic and DOM work only; the app's side, which renders and writes it, is in exportDoc.ts.

import { basename } from "@/lib/paths";

export type ExportKind = "html" | "pdf";

/** `name` without its last extension; a name that starts with its only dot keeps it. */
function stem(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** The document's file name without its extension, the title of a document that has no top heading. */
export const fileTitle = (path: string) => stem(basename(path));

/** Where the Save dialog suggests the export: next to the document, its name with `.html` or `.pdf`. */
export function exportPath(path: string, kind: ExportKind) {
  const name = basename(path);
  return `${path.slice(0, path.length - name.length)}${stem(name)}.${kind}`;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ESCAPES[c]);

/** The whole exported page: the document's HTML in the reading view's column, under its title, with its styles. */
export function pageHtml(title: string, body: string, css: string) {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${css}</style>`,
    "</head>",
    "<body>",
    `<div class="doc-column"><article class="doc">${body}</article></div>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/**
 * Keeps only the `.woff2` file of each font in `css`: every engine that opens the page reads it, so the others
 * would only make the file larger. A `src` without one stays as it is.
 */
export function woff2Only(css: string) {
  return css.replace(/src:([^;}]*)/g, (all, list: string) => {
    // A data: URL holds commas of its own, so a list with one stays whole.
    if (list.includes("data:")) return all;
    const woff2 = list.split(",").find((src) => /format\(\s*["']?woff2["']?\s*\)/.test(src));
    return woff2 ? `src:${woff2.trim()}` : all;
  });
}

/** `url(…)` in a stylesheet, quoted or not, except a `data:` URL. The URL can't hold `(`, so no match runs past the next `url(`. */
const URL_IN_CSS = /url\(\s*(["']?)(?!data:)([^"'()\s]+)\1\s*\)/g;

/**
 * `css` with each URL it loads replaced by `load`'s `data:` URL for it, so the page needs no other file. A URL
 * that can't be loaded stays as it was.
 */
export async function inlineUrls(css: string, load: (url: string) => Promise<string>) {
  const urls = new Set([...css.matchAll(URL_IN_CSS)].map((m) => m[2]));
  const data = new Map<string, string>();
  await Promise.all(
    [...urls].map((url) =>
      load(url).then(
        (d) => data.set(url, d),
        () => undefined,
      ),
    ),
  );
  return css.replace(URL_IN_CSS, (all, _quote, url: string) => (data.has(url) ? `url(${data.get(url)})` : all));
}

/** The local images of `root` as `src` URLs that start with `assetBase`, by the full path each one shows. */
export function localImages(root: HTMLElement, assetBase: string) {
  const found = new Map<string, HTMLImageElement[]>();
  for (const img of root.querySelectorAll<HTMLImageElement>("img[src]")) {
    const src = img.getAttribute("src")!;
    if (!src.startsWith(assetBase)) continue;
    let path: string;
    try {
      path = decodeURIComponent(src.slice(assetBase.length));
    } catch {
      continue;
    }
    found.set(path, [...(found.get(path) ?? []), img]);
  }
  return found;
}

/**
 * Lays the rendered document in `article` out for export, and returns its title. The title goes first: the
 * document's own top heading when it starts with one, else `fallback`. Then the properties, then a Contents list
 * that links the headings of levels 2 to 4, when there are any. What only works in the app goes: Copy buttons, the
 * paths of local images and `<source>` sets on local files. Task boxes become drawn marks.
 */
export function arrange(article: HTMLElement, fallback: string, assetBase: string) {
  const doc = article.ownerDocument;
  article.querySelectorAll(".code-copy").forEach((b) => b.remove());
  // A drawn mark in place of each task box: paper drops a checkbox's fill, so a ticked one would print empty.
  for (const box of article.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    const mark = doc.createElement("span");
    mark.className = "task-box";
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", box.hasAttribute("checked") ? "Done" : "Not done");
    if (box.hasAttribute("checked")) mark.dataset.checked = "";
    box.replaceWith(mark);
  }
  article.querySelectorAll("[data-src]").forEach((el) => el.removeAttribute("data-src"));
  article.querySelectorAll("source[srcset]").forEach((s) => s.getAttribute("srcset")!.includes(assetBase) && s.remove());

  const properties = article.querySelector(":scope > .doc-properties, :scope > .doc-properties-yaml");
  const first = properties ? properties.nextElementSibling : article.firstElementChild;
  const own = first?.tagName === "H1";
  const title = own ? (first as HTMLElement) : doc.createElement("h1");
  if (!own) title.textContent = fallback;
  article.prepend(title);

  const headings = [...article.querySelectorAll<HTMLElement>("h2[id], h3[id], h4[id]")];
  if (headings.length) {
    const nav = doc.createElement("nav");
    nav.className = "doc-contents";
    nav.setAttribute("aria-label", "Contents");
    const label = doc.createElement("h2");
    label.textContent = "Contents";
    const list = doc.createElement("ol");
    for (const h of headings) {
      const item = doc.createElement("li");
      item.dataset.level = h.tagName[1];
      const link = doc.createElement("a");
      link.setAttribute("href", `#${h.id}`);
      link.textContent = h.textContent;
      item.append(link);
      list.append(item);
    }
    nav.append(label, list);
    (properties ?? title).after(nav);
  }
  return title.textContent?.trim() || fallback;
}
