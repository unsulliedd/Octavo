// One render request and its answer, as passed between the UI and the render worker.

import type { render } from "./render";

export type RenderRequest = {
  id: number;
  md: string;
  /** Folder of the document, for its relative image paths. */
  dir: string;
  /** Asset URL prefix; a local image's URL is this plus its encoded full path (Tauri's convertFileSrc). */
  assetBase: string;
};

export type RenderResult = {
  html: string;
  /** Full paths of the local images the document shows. */
  images: string[];
  /** The document contains KaTeX output, so the KaTeX stylesheet is needed. */
  math: boolean;
};

export type RenderResponse = ({ ok: true } & RenderResult) | { ok: false; error: string };

/** Renders one request. Never throws: a failure becomes an error response. */
export async function runRenderJob(req: RenderRequest, renderFn: typeof render): Promise<RenderResponse & { id: number }> {
  const images: string[] = [];
  try {
    const html = await renderFn(req.md, req.dir, (path) => {
      images.push(path);
      return req.assetBase + encodeURIComponent(path);
    });
    return { id: req.id, ok: true, html, images, math: html.includes('class="katex') };
  } catch (e) {
    return { id: req.id, ok: false, error: String(e) };
  }
}
