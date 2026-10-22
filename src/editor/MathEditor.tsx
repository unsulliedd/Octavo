import { useEffect, useRef, useState } from "react";

type Props = {
  /** The formula's TeX source. */
  value: string;
  block: boolean;
  /** The formula's bottom left corner in the editor pane; the popover opens under it. */
  left: number;
  top: number;
  /** The formula as HTML, for the preview. */
  render: (value: string) => string;
  /** Writes the source, or removes the formula when it is empty. */
  onDone: (value: string) => void;
};

/**
 * The source of the selected formula with a live preview. Enter (Ctrl+Enter in a block) or Done applies it,
 * Escape keeps the formula as it was; an empty formula is removed.
 */
export function MathEditor({ value, block, left, top, render, onDone }: Props) {
  const [source, setSource] = useState(value);
  const field = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  function finish(next: string) {
    if (done.current) return;
    done.current = true;
    onDone(next);
  }

  return (
    <div className="math-editor" role="dialog" aria-label={block ? "Math block" : "Inline math"} style={{ left, top: top + 6 }}>
      <textarea
        ref={field}
        aria-label="Formula in TeX"
        spellCheck={false}
        placeholder={block ? "\\int_0^1 x^2 \\, dx" : "x^2 + y^2"}
        rows={block ? 4 : 2}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        onBlur={() => finish(source)}
        onKeyDown={(e) => {
          if (e.key === "Escape") finish(value);
          else if (e.key === "Enter" && (block ? e.ctrlKey || e.metaKey : !e.shiftKey)) finish(source);
          else return;
          e.preventDefault();
        }}
      />
      <div className="math-preview" aria-live="polite" dangerouslySetInnerHTML={{ __html: source.trim() ? render(source) : "" }} />
      <div className="math-editor-foot">
        <span className="muted">{block ? "Ctrl+Enter" : "Enter"} applies, Escape cancels</span>
        <button className="text-btn primary" onMouseDown={(e) => e.preventDefault()} onClick={() => finish(source)}>
          Done
        </button>
      </div>
    </div>
  );
}
