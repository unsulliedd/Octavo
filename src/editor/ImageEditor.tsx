import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  alt: string;
  title: string;
  /** The image's bottom left corner in the editor pane; the popover opens under it. */
  left: number;
  top: number;
  onDone: (alt: string, title: string) => void;
};

/**
 * The selected image's alt text and title. Enter or Done applies them, leaving the popover too; Escape keeps
 * them as they were.
 */
export function ImageEditor({ src, alt, title, left, top, onDone }: Props) {
  const [values, setValues] = useState({ alt, title });
  const first = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);

  function finish(next: { alt: string; title: string }) {
    if (done.current) return;
    done.current = true;
    onDone(next.alt, next.title);
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") finish({ alt, title });
    else if (e.key === "Enter") finish(values);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="math-editor image-editor"
      role="dialog"
      aria-label="Image"
      style={{ left, top: top + 6 }}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && finish(values)}
    >
      <label>
        <span className="setting-label">Alt text</span>
        <input ref={first} value={values.alt} onChange={(e) => setValues({ ...values, alt: e.target.value })} onKeyDown={keys} />
      </label>
      <label>
        <span className="setting-label">Title</span>
        <input
          value={values.title}
          placeholder="Shown when the pointer rests on the image"
          onChange={(e) => setValues({ ...values, title: e.target.value })}
          onKeyDown={keys}
        />
      </label>
      <div className="math-editor-foot">
        <span className="muted">{src} · Enter applies, Escape cancels</span>
        <button className="text-btn primary" onMouseDown={(e) => e.preventDefault()} onClick={() => finish(values)}>
          Done
        </button>
      </div>
    </div>
  );
}
