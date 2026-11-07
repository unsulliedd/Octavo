import type { Heading } from "./useReadingView";

type Props = {
  headings: Heading[];
  activeId: string | undefined;
  /** Scrolls to the heading with this index. */
  onJump: (index: number) => void;
};

/** The document's outline: its headings, with the one scrolled to marked. */
export function Outline({ headings, activeId, onJump }: Props) {
  return (
    <>
      <div className="sidebar-head">
        <span className="section-label">Outline</span>
        <span className="count">{headings.length}</span>
      </div>
      <nav className="outline">
        {headings.length === 0 && <p className="muted">No headings</p>}
        {headings.map((h, i) => (
          <a
            key={h.id}
            href={`#${h.id}`}
            data-level={h.level}
            aria-current={h.id === activeId ? "location" : undefined}
            onClick={(e) => {
              e.preventDefault();
              onJump(i);
            }}
          >
            {h.text}
          </a>
        ))}
      </nav>
    </>
  );
}
