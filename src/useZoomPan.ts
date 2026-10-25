import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fitZoom, stepZoom } from "./mermaid";

/**
 * Zoom and drag-to-move for a drawing of `size` in a scrolling box. The drawing starts zoomed to fit the box once
 * its size is known; after that the zoom is set by `setZoom` or Ctrl+wheel, `fit` fits it again (also on a
 * double-click), and a zoomed drawing that is bigger than the box is dragged around. `content` is whatever the box
 * shows; when it changes, whether the drawing is bigger than the box is checked again. Spread `canvas` on the box.
 */
export function useZoomPan(size: { width: number; height: number } | undefined, content: unknown) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>();
  // Dragging a zoomed drawing moves it: where the pointer went down, and the scroll position then.
  const drag = useRef<{ x: number; y: number; left: number; top: number }>(undefined);
  const shownZoom = zoom ?? 1;
  const fit = () => size && box.current && setZoom(fitZoom(size, { width: box.current.clientWidth - 32, height: box.current.clientHeight - 32 }));
  useLayoutEffect(() => {
    if (zoom === undefined) fit();
  }, [size, zoom]);
  // Ctrl+wheel zooms. A passive listener can't stop the window from zooming too, so it is added here.
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
  // Whether the drawing is bigger than the box, so there is something to drag; checked when either changes size.
  const [pannable, setPannable] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setPannable(el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shownZoom, content]);

  const canvas = {
    ref: box,
    "data-pannable": pannable || undefined,
    onDoubleClick: fit,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (e.button !== 0 || !pannable) return;
      drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      el.setPointerCapture(e.pointerId);
      el.dataset.dragging = "";
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      e.currentTarget.scrollTo(d.left - (e.clientX - d.x), d.top - (e.clientY - d.y));
    },
    onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) => {
      drag.current = undefined;
      delete e.currentTarget.dataset.dragging;
    },
  };
  return { zoom: shownZoom, setZoom, fit, canvas };
}
