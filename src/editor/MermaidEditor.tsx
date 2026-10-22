import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { diagramSvg, fitZoom, indentLines, stepZoom, svgSize } from "../mermaid";

type Props = {
  /** The diagram's Mermaid source. */
  value: string;
  dark: boolean;
  /** Writes the source; an empty one removes the diagram. */
  onDone: (value: string) => void;
  onCancel: () => void;
  /** Turns the diagram into a plain code block. */
  onCode: () => void;
};

/**
 * The selected Mermaid diagram's source beside a preview that follows the typing. The preview zooms with the slider
 * or Ctrl+wheel, fits again on a double-click and is dragged around when zoomed. Ctrl+Enter or Done applies the source;
 * Escape, Cancel or a click beside the dialog (after asking, when it was changed) keeps the diagram as it was.
 */
export function MermaidEditor({ value, dark, onDone, onCancel, onCode }: Props) {
  const [source, setSource] = useState(value);
  const [preview, setPreview] = useState<{ svg: string } | { error: string }>();
  const field = useRef<HTMLTextAreaElement>(null);
  // Line numbers beside the source; long lines scroll sideways instead of wrapping, so they stay in line.
  const gutter = useRef<HTMLDivElement>(null);
  // The preview starts zoomed to fit the first drawing; after that the slider sets the zoom.
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>();
  // Dragging a zoomed drawing moves it: where the pointer went down, and the scroll position then.
  const drag = useRef<{ x: number; y: number; left: number; top: number }>(undefined);
  const size = preview && "svg" in preview ? svgSize(preview.svg) : undefined;
  const shownZoom = zoom ?? 1;
  const fit = () => size && box.current && setZoom(fitZoom(size, { width: box.current.clientWidth - 32, height: box.current.clientHeight - 32 }));
  useLayoutEffect(() => {
    if (zoom === undefined) fit();
  }, [size, zoom]);
  // Ctrl+wheel zooms the preview. A passive listener can't stop the window from zooming too, so it is added here.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => stepZoom(z ?? 1, e.deltaY < 0));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // Whether the drawing is bigger than the preview, so there is something to drag; checked when either changes size.
  const [pannable, setPannable] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setPannable(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shownZoom, preview]);
  useEffect(() => field.current?.focus(), []);
  useEffect(() => {
    if (!source.trim()) return setPreview(undefined);
    let current = true;
    const timer = setTimeout(() => void diagramSvg(source, dark).then((p) => current && setPreview(p)), 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [source, dark]);

  // A click beside the dialog cancels it, after asking when there are changes that would be lost.
  async function cancelOutside() {
    if (source === value || (await ask("Discard your changes to the diagram?", { kind: "warning", okLabel: "Discard", cancelLabel: "Keep editing" }))) onCancel();
    else field.current?.focus();
  }

  /** Tab and Shift+Tab indent the source, through the browser's own editing so Ctrl+Z undoes them. */
  function indent(textarea: HTMLTextAreaElement, outdent: boolean) {
    const change = indentLines(textarea.value, textarea.selectionStart, textarea.selectionEnd, outdent);
    if (textarea.value.slice(change.from, change.to) !== change.text) {
      textarea.setSelectionRange(change.from, change.to);
      document.execCommand("insertText", false, change.text);
    }
    textarea.setSelectionRange(change.start, change.end);
  }

  return (
    <div
      className="dialog-backdrop fixed"
      onMouseDown={(e) => e.target === e.currentTarget && void cancelOutside()}
      onKeyDown={(e) => e.key === "Escape" && (e.preventDefault(), onCancel())}
    >
      <section className="mermaid-editor" role="dialog" aria-modal="true" aria-label="Mermaid diagram">
        <header className="settings-head">
          <strong>Mermaid diagram</strong>
          <button className="icon-btn" aria-label="Cancel" onClick={onCancel}>
            <Icon name="close" />
          </button>
        </header>
        <div className="mermaid-editor-main">
          <div className="code-input">
            <div className="code-gutter" ref={gutter} aria-hidden="true">
              {source.split("\n").map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <textarea
              ref={field}
              aria-label="Diagram source"
              spellCheck={false}
              wrap="off"
              placeholder={"flowchart LR\n  A --> B"}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onDone(source);
                else if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) indent(e.currentTarget, e.shiftKey);
                else return;
                e.preventDefault();
              }}
            />
          </div>
          <div className="mermaid-preview">
            <div
              className="mermaid-canvas"
              ref={box}
              aria-label="Preview"
              aria-live="polite"
              data-pannable={pannable || undefined}
              onDoubleClick={fit}
              onPointerDown={(e) => {
                const el = e.currentTarget;
                if (e.button !== 0 || !pannable) return;
                drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
                el.setPointerCapture(e.pointerId);
                el.dataset.dragging = "";
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                e.currentTarget.scrollTo(d.left - (e.clientX - d.x), d.top - (e.clientY - d.y));
              }}
              onLostPointerCapture={(e) => {
                drag.current = undefined;
                delete e.currentTarget.dataset.dragging;
              }}
            >
              {!preview ? (
                <span className="muted">The preview shows here</span>
              ) : "svg" in preview ? (
                <div className="mermaid-drawing" style={size && { width: size.width * shownZoom }} dangerouslySetInnerHTML={{ __html: preview.svg }} />
              ) : (
                <p className="mermaid-error">{preview.error}</p>
              )}
            </div>
            <label className="mermaid-zoom" title="Ctrl+wheel over the preview zooms too; double-click it to fit">
              <span>Zoom</span>
              <input
                type="range"
                min={10}
                max={400}
                step={5}
                value={Math.round(shownZoom * 100)}
                disabled={!size}
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
              />
              <output>{Math.round(shownZoom * 100)}%</output>
            </label>
          </div>
        </div>
        <footer className="mermaid-editor-foot">
          <span className="muted">Ctrl+Enter applies, Escape cancels, Tab indents; an empty diagram is removed.</span>
          <button className="text-btn quiet" onClick={onCode}>
            Show as code
          </button>
          <button className="text-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="text-btn primary" onClick={() => onDone(source)}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
