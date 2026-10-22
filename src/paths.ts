// File path helpers shared by the render pipeline and the UI. Paths keep the separator style they come with.

export const dirname = (path: string) => path.replace(/[\\/][^\\/]*$/, "");

export function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Joins and normalizes `rel` onto `dir`, keeping the root ("C:" or "/") and dir's separator. */
export function joinPath(dir: string, rel: string) {
  const out: string[] = [];
  for (const part of `${dir}/${rel}`.split(/[\\/]+/)) {
    if (part === "..") {
      if (out.length > 1) out.pop();
    } else if (part !== ".") out.push(part);
  }
  return out.join(dir.includes("\\") ? "\\" : "/");
}

/**
 * `file` relative to the folder `dir`, with forward slashes, for a link in a Markdown file. A file on another
 * drive keeps its absolute path. Windows paths compare without regard to case.
 */
export function relativePath(dir: string, file: string) {
  const parts = (p: string) => p.split(/[\\/]+/).filter(Boolean);
  const from = parts(dir);
  const to = parts(file);
  const windows = /^[a-z]:$/i.test(to[0] ?? "");
  const same = (a: string, b: string) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (windows && !same(from[0] ?? "", to[0])) return to.join("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && same(from[i], to[i])) i++;
  return "../".repeat(from.length - i) + to.slice(i).join("/");
}

/** Maps an <img src> from the document to something the webview can load. */
export function resolveLocal(dir: string, src: string, toUrl: (path: string) => string) {
  if (/^[a-z]:[\\/]/i.test(src)) return toUrl(src); // absolute Windows path
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return src; // URL or fragment
  return toUrl(joinPath(dir, safeDecode(src.split(/[?#]/)[0])));
}
