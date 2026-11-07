import { afterPaint } from "@/lib/paint";
import { createRenderer } from "./renderClient";

/** Renders documents in a Web Worker; falls back to the main thread if a worker can't run. */
export const renderDoc = createRenderer(
  () => new Worker(new URL("./render.worker.ts", import.meta.url), { type: "module" }),
  () => import("./render").then((m) => m.render),
  afterPaint, // a main-thread render blocks the window, so the loading indicator is drawn first
);

/** Mermaid is loaded only for documents that contain a mermaid block. */
export async function renderMermaid(root: HTMLElement, dark: boolean) {
  const blocks = root.querySelectorAll("pre > code.language-mermaid");
  if (!blocks.length) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
  const nodes = [...blocks].map((code) => {
    const div = document.createElement("div");
    div.className = "mermaid";
    div.textContent = code.textContent;
    code.parentElement!.replaceWith(div);
    return div;
  });
  await mermaid.run({ nodes, suppressErrors: true });
}
