// Export to HTML and PDF: renders a document as the reading view does, in the light theme, and writes it as one
// self-contained page, or prints that page to PDF.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { basename, dirname } from "@/lib/paths";
import { renderDoc, renderMermaid } from "@/reading/renderDoc";
import { message } from "@/ui/dialog";
import tokensCss from "@/styles/tokens.css?inline";
import readingCss from "@/reading/reading.css?inline";
import pageCss from "./page.css?inline";
import { arrange, exportPath, fileTitle, inlineUrls, localImages, pageHtml, woff2Only, type ExportKind } from "./exportPage";

const FILTERS: Record<ExportKind, { name: string; extensions: string[] }> = {
  html: { name: "Web page", extensions: ["html"] },
  pdf: { name: "PDF document", extensions: ["pdf"] },
};

/** A file the app serves, such as a formula font, as a `data:` URL. */
async function fileData(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * The page's styles: the app's light tokens, its reading styles, the formula styles when there are formulas, and the page's own.
 * Limitation: the default light colors; colors changed in Settings › Colors aren't carried into the export.
 */
async function styles(math: boolean) {
  const katex = math ? woff2Only((await import("katex/dist/katex.min.css?inline")).default) : "";
  return inlineUrls([tokensCss, readingCss, katex, pageCss].join("\n"), fileData);
}

/** Puts each local image into the page as a `data:` URL. An image that can't be read keeps only its alt text. */
async function embedImages(article: HTMLElement, assetBase: string) {
  await Promise.all(
    [...localImages(article, assetBase)].map(([path, imgs]) =>
      invoke<string>("export_image", { path }).then(
        (data) => imgs.forEach((img) => img.setAttribute("src", data)),
        () => imgs.forEach((img) => img.removeAttribute("src")),
      ),
    ),
  );
}

/** The exported page of the document at `path` with the Markdown `md`: its diagrams drawn and its images in it. */
export async function exportPage(md: string, path: string) {
  const assetBase = convertFileSrc("");
  const { html, images, math } = await renderDoc(md, dirname(path), assetBase);
  if (images.length) await invoke("allow_images", { paths: images }).catch(() => {});
  // Diagrams are drawn in the window, out of sight, so their text can be measured.
  const stage = document.createElement("div");
  stage.className = "export-stage";
  stage.setAttribute("aria-hidden", "true");
  const article = document.createElement("article");
  article.className = "doc";
  article.innerHTML = html;
  stage.append(article);
  document.body.append(stage);
  try {
    await renderMermaid(article, false);
  } finally {
    stage.remove();
  }
  await embedImages(article, assetBase);
  const title = arrange(article, fileTitle(path), assetBase);
  return pageHtml(title, article.innerHTML, await styles(math));
}

/**
 * Exports the document at `path` as HTML or PDF, to a file picked in the Save dialog. `md` is what its tab shows,
 * unsaved edits included; without it, the file is read.
 */
export async function exportDocument(kind: ExportKind, path: string, md: string | undefined) {
  const target = await saveDialog({ defaultPath: exportPath(path, kind), filters: [FILTERS[kind]] });
  if (typeof target !== "string") return;
  try {
    const text = md ?? (await invoke<{ text: string }>("open_doc", { path })).text;
    const html = await exportPage(text, path);
    await invoke(kind === "html" ? "export_html" : "export_pdf", { path: target, html });
  } catch (e) {
    await message(`${basename(path)} couldn't be exported: ${e instanceof Error ? e.message : e}`);
  }
}
