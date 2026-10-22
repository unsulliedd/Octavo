// Images that fail to load are replaced with a placeholder that says which file is missing.

import { safeDecode } from "./paths";

/** The placeholder's text for an image whose source was `src` in the document. */
export function missingImage(src: string, alt: string) {
  const remote = /^(https?:)?\/\//i.test(src);
  const file = safeDecode(src.split(/[?#]/)[0]).split(/[\\/]/).filter(Boolean).pop() || src;
  return {
    label: remote ? "Image couldn't be loaded" : "Image not found",
    detail: alt.trim() && alt.trim() !== file ? `${alt.trim()} · ${file}` : file,
  };
}

const failed = (img: HTMLImageElement) => img.complete && img.naturalWidth === 0 && !!img.getAttribute("src");

/** Replaces one image with its placeholder. The document's own source is in `data-src`. */
export function replaceWithPlaceholder(img: HTMLImageElement) {
  const src = img.dataset.src ?? img.getAttribute("src") ?? "";
  const { label, detail } = missingImage(src, img.alt);
  const box = img.ownerDocument.createElement("span");
  box.className = "img-missing";
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", `${label}: ${detail}`);
  box.title = src;
  const strong = img.ownerDocument.createElement("strong");
  strong.textContent = label;
  const small = img.ownerDocument.createElement("span");
  small.textContent = detail;
  box.append(strong, small);
  img.replaceWith(box);
}

/**
 * Shows a placeholder for every image under `root` that fails to load, including ones that already failed.
 * Returns a function that stops listening.
 */
export function watchBrokenImages(root: HTMLElement) {
  const onError = (e: Event) => {
    if (e.target instanceof HTMLImageElement) replaceWithPlaceholder(e.target);
  };
  root.addEventListener("error", onError, true); // error doesn't bubble; capture sees it
  root.querySelectorAll("img").forEach((img) => failed(img) && replaceWithPlaceholder(img));
  return () => root.removeEventListener("error", onError, true);
}

const PASTED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
};

/**
 * The name a pasted image is saved under: the file's own name, or "pasted-YYYYMMDD-HHMMSS" for a screenshot,
 * which arrives as "image.png". Undefined for image types the reading view can't show.
 */
export function pastedName(file: { name: string; type: string }, now: Date) {
  const ext = PASTED_TYPES[file.type];
  if (!ext) return undefined;
  const own = file.name.split(/[\\/]/).pop() ?? "";
  if (own && own !== "image.png" && /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(own)) return own;
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `pasted-${stamp}.${ext}`;
}
