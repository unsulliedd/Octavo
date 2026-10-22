// Mermaid diagrams outside the reading view: in the editor and its diagram dialog. Mermaid loads on first use.

let count = 0;

/** The diagram as SVG, or Mermaid's message when the source has an error. */
export async function diagramSvg(source: string, dark: boolean): Promise<{ svg: string } | { error: string }> {
  const id = `octavo-diagram-${++count}`;
  try {
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
    return { svg: (await mermaid.render(id, source)).svg };
  } catch (e) {
    // A failed render leaves its scratch element in the page.
    document.getElementById(`d${id}`)?.remove();
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** A drawn diagram's own size, from its viewBox. */
export function svgSize(svg: string) {
  const box = /viewBox="[-\d.e]+[ ,]+[-\d.e]+[ ,]+([\d.e]+)[ ,]+([\d.e]+)"/.exec(svg);
  return box ? { width: Number(box[1]), height: Number(box[2]) } : undefined;
}

/** The zoom at which a diagram fits in a box, never above 100%, between 10% and 400% in steps of 5%. */
export function fitZoom(size: { width: number; height: number }, box: { width: number; height: number }) {
  const fit = Math.min(1, box.width / size.width, box.height / size.height);
  return Math.min(4, Math.max(0.1, Math.floor(fit * 20) / 20));
}

/** One step of wheel zoom, in or out: about 15% at a time on the slider's 5% steps, between 10% and 400%. */
export function stepZoom(zoom: number, zoomIn: boolean) {
  let next = Math.round(zoom * (zoomIn ? 1.15 : 1 / 1.15) * 20) / 20;
  if (next === zoom) next = zoom + (zoomIn ? 0.05 : -0.05);
  return Math.min(4, Math.max(0.1, Math.round(next * 20) / 20));
}

const INDENT = "    ";

/**
 * Tab and Shift+Tab in a source text. Tab without a selection inserts four spaces; otherwise every line the
 * selection touches is indented by four spaces, or with `outdent` loses up to four leading spaces. Returns
 * the range to replace, its new text and the selection afterwards.
 */
export function indentLines(text: string, start: number, end: number, outdent: boolean) {
  if (start === end && !outdent) return { from: start, to: end, text: INDENT, start: start + 4, end: start + 4 };
  const from = text.lastIndexOf("\n", start - 1) + 1;
  // A selection that ends at the start of a line leaves that line alone.
  const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const lineEnd = text.indexOf("\n", last);
  const to = lineEnd < 0 ? text.length : lineEnd;
  const lines = text.slice(from, to).split("\n");
  const changed = lines.map((line) => (outdent ? line.replace(/^ {1,4}/, "") : INDENT + line)).join("\n");
  if (start === end) {
    const removed = lines[0].length - changed.length;
    const at = Math.max(from, start - removed);
    return { from, to, text: changed, start: at, end: at };
  }
  return { from, to, text: changed, start: from, end: from + changed.length };
}

/** Whether the element is shown in the dark theme. */
export const isDark = (el: Element) => el.closest("[data-theme]")?.getAttribute("data-theme") === "dark";
