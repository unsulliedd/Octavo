// File path helpers shared by the render pipeline and the UI. Paths keep the separator style they come with.

export const dirname = (path: string) => path.replace(/[\\/][^\\/]*$/, "");

export function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The server of a network path ("\\server\share\file"), in lower case; undefined for any other path. */
const serverOf = (path: string) => /^[\\/]{2}([^\\/]+)[\\/]/.exec(path)?.[1].toLowerCase();

/** Joins and normalizes `rel` onto `dir`, keeping the root ("C:", "/" or "\\server\share") and dir's separator. */
export function joinPath(dir: string, rel: string) {
  const network = !!serverOf(dir);
  const out: string[] = [];
  for (const part of `${dir}/${rel}`.split(/[\\/]+/)) {
    if (part === "..") {
      if (out.length > (network ? 3 : 1)) out.pop();
    } else if (part !== ".") out.push(part);
  }
  const separator = dir.includes("\\") ? "\\" : "/";
  return (network ? separator : "") + out.join(separator);
}

/**
 * `file` relative to the folder `dir`, with forward slashes, for a link in a Markdown file. A file on another
 * drive or network share keeps its absolute path. Windows paths compare without regard to case.
 */
export function relativePath(dir: string, file: string) {
  const parts = (p: string) => p.split(/[\\/]+/).filter(Boolean);
  const from = parts(dir);
  const to = parts(file);
  const network = !!serverOf(file);
  const windows = network || /^[a-z]:$/i.test(to[0] ?? "");
  const same = (a: string, b: string) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  const root = network ? 2 : 1;
  if (windows && !same(from.slice(0, root).join("/"), to.slice(0, root).join("/"))) return (network ? "//" : "") + to.join("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && same(from[i], to[i])) i++;
  return "../".repeat(from.length - i) + to.slice(i).join("/");
}

/** Maps an <img src> from the document to something the webview can load. */
export function resolveLocal(dir: string, src: string, toUrl: (path: string) => string) {
  if (/^[a-z]:[\\/]/i.test(src)) return toUrl(src); // absolute Windows path
  const path = safeDecode(src.split(/[?#]/)[0]);
  // Markdown reads the "\\" of a network path as an escaped "\", so one may be left.
  const network = path.replace(/^\\(?=[^\\/])/, "\\\\").replace(/\//g, "\\");
  // Limitation: a network path loads only from the document's own server. Reading one makes Windows send the
  // user's credentials to that server, so a document can't name another one; its image shows as missing.
  if (serverOf(network) && serverOf(network) === serverOf(dir)) return toUrl(joinPath(network, "."));
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return src; // URL or fragment
  return toUrl(joinPath(dir, path));
}
