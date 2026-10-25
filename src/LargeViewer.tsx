import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { cycleFocus, type LargeContent, type Size } from "./largeView";
import { svgSize } from "./mermaid";
import { useZoomPan } from "./useZoomPan";

type Props = {
  content: LargeContent;
  onClose: () => void;
};

/**
 * A diagram, image or table from the reading view, large over the whole window. Diagrams and images zoom with the
 * slider or Ctrl+wheel, fit again on a double-click and are dragged around when larger than the view; a table
 * fills the view's width and scrolls inside it. Escape, the close button or a click outside the panel closes it, and
 * focus goes back to where it was.
 */
export function LargeViewer({ content, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [opener] = useState(() => document.activeElement);
  // A click closes the view only when the press began outside the panel too, so dragging out of it doesn't.
  const pressedOutside = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    closeButton.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);

  // Escape closes the view and goes no further; Tab stays inside the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")];
        e.preventDefault();
        items[cycleFocus(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey)]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      className="large-backdrop"
      onMouseDown={(e) => (pressedOutside.current = e.target === e.currentTarget)}
      onClick={(e) => e.target === e.currentTarget && pressedOutside.current && onClose()}
    >
      <section ref={panel} className="large-panel" data-kind={content.kind} role="dialog" aria-modal="true" aria-label={content.title}>
        <header className="large-head">
          <strong title={content.title}>{content.title}</strong>
          <button ref={closeButton} className="icon-btn" aria-label="Close (Escape)" title="Close (Escape)" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {content.kind === "table" ? (
          <div className="large-body" data-kind="table">
            <div className="doc large-table" dangerouslySetInnerHTML={{ __html: content.markup }} />
          </div>
        ) : (
          <ZoomedView content={content} />
        )}
      </section>
    </div>
  );
}

/** A diagram or an image in a box it is zoomed and dragged in, with the zoom controls under it. */
function ZoomedView({ content }: { content: Exclude<LargeContent, { kind: "table" }> }) {
  // An image's size is known once it has loaded, unless the document's own copy had loaded already.
  const [loaded, setLoaded] = useState<Size | undefined>(content.kind === "image" ? content.size : undefined);
  const markup = content.kind === "diagram" ? content.markup : undefined;
  const size = useMemo(() => (markup ? svgSize(markup) : loaded), [markup, loaded]);
  const { zoom, setZoom, fit, canvas } = useZoomPan(size, content);
  const width = size && { width: size.width * zoom };
  return (
    <>
      <div className="large-body" data-kind={content.kind} {...canvas}>
        {content.kind === "diagram" ? (
          <div className="mermaid-drawing" style={width} dangerouslySetInnerHTML={{ __html: content.markup }} />
        ) : (
          <img
            className="large-image"
            src={content.src}
            alt={content.alt}
            draggable={false}
            style={width}
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (naturalWidth > 0) setLoaded({ width: naturalWidth, height: naturalHeight });
            }}
          />
        )}
      </div>
      <footer className="large-foot">
        <span>Drag to move · Ctrl+wheel zooms · double-click fits</span>
        <div className="large-controls">
          <label className="large-zoom">
            <span>Zoom</span>
            <input
              type="range"
              min={10}
              max={400}
              step={5}
              value={Math.round(zoom * 100)}
              disabled={!size}
              onChange={(e) => setZoom(Number(e.target.value) / 100)}
            />
            <output>{Math.round(zoom * 100)}%</output>
          </label>
          <button className="text-btn" disabled={!size} onClick={fit}>
            Fit
          </button>
        </div>
      </footer>
    </>
  );
}
