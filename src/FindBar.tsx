import { useEffect, useRef, useState, type RefObject } from "react";
import { findRanges, firstVisible, matchLabel, stepIndex } from "./find";
import { Icon } from "./icons";

type Props = {
  query: string;
  onQuery: (query: string) => void;
  /** The rendered document to search. */
  root: RefObject<HTMLElement | null>;
  /** The scrolling reading area, to bring the current match into view. */
  scroller: RefObject<HTMLElement | null>;
  /** Changes whenever the document's DOM is replaced, so matches are found again. */
  content: unknown;
  /** Changes on every Find shortcut, to focus and select the input again. */
  focusKey: number;
  onClose: () => void;
};

const highlights = typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : undefined;

/** Scrolls `scroller` (and a horizontally scrolling code block) so `range` is visible. */
function reveal(range: Range, scroller: HTMLElement) {
  const pre = range.startContainer.parentElement?.closest("pre");
  if (pre && pre.scrollWidth > pre.clientWidth) {
    const r = range.getBoundingClientRect();
    const box = pre.getBoundingClientRect();
    if (r.left < box.left || r.right > box.right) pre.scrollLeft += r.left - box.left - box.width / 3;
  }
  const r = range.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (r.top < box.top + 8 || r.bottom > box.bottom - 8) scroller.scrollBy({ top: r.top - box.top - box.height / 3 });
}

/** The find bar: matches are painted with the CSS Custom Highlight API, the document's DOM is not changed. */
export function FindBar({ query, onQuery, root, scroller, content, focusKey, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [ranges, setRanges] = useState<Range[]>([]);
  const [index, setIndex] = useState(-1);
  const lastQuery = useRef<string>(undefined);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusKey]);

  // Search again when the query or the document changes. A new query starts at the first match in view.
  useEffect(() => {
    const found = root.current ? findRanges(root.current, query) : [];
    setRanges(found);
    highlights?.set("find", new Highlight(...found));
    if (lastQuery.current !== query || !found.length) {
      const top = scroller.current?.getBoundingClientRect().top ?? 0;
      setIndex(firstVisible(found.map((r) => r.getBoundingClientRect().top), top));
    } else {
      setIndex((i) => Math.min(i, found.length - 1));
    }
    lastQuery.current = query;
  }, [query, content, root, scroller]);

  useEffect(() => {
    const current = ranges[index];
    if (!current) {
      highlights?.delete("find-current");
      return;
    }
    highlights?.set("find-current", new Highlight(current));
    if (scroller.current) reveal(current, scroller.current);
  }, [ranges, index, scroller]);

  useEffect(
    () => () => {
      highlights?.delete("find");
      highlights?.delete("find-current");
    },
    [],
  );

  const step = (n: number) => setIndex((i) => stepIndex(i, n, ranges.length));

  // Escape and F3 work while the focus is in the document too.
  const keys = useRef({ step, onClose });
  keys.current = { step, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") keys.current.onClose();
      else if (e.key === "F3") {
        e.preventDefault();
        keys.current.step(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const label = matchLabel(index, ranges.length, query);

  return (
    <div className="find" role="search">
      <Icon name="search" />
      <label htmlFor="find-input" className="visually-hidden">
        Find in document
      </label>
      <input
        id="find-input"
        ref={input}
        value={query}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          }
        }}
      />
      <span className="find-count" aria-live="polite">
        {label}
      </span>
      <button className="icon-btn" aria-label="Previous match (Shift+Enter)" disabled={!ranges.length} onClick={() => step(-1)}>
        <Icon name="up" />
      </button>
      <button className="icon-btn" aria-label="Next match (Enter)" disabled={!ranges.length} onClick={() => step(1)}>
        <Icon name="down" />
      </button>
      <button className="icon-btn" aria-label="Close find (Escape)" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}
