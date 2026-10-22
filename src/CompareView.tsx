import { useMemo } from "react";
import { Icon } from "./icons";
import { diffLines, foldUnchanged, splitLines } from "./lineDiff";

type Props = {
  name: string;
  /** The file's text on disk. */
  disk: string;
  /** The unsaved edits, as Markdown. */
  mine: string;
  onReload: () => void;
  onKeep: () => void;
  onClose: () => void;
};

/** The file on disk next to the unsaved edits, as a line diff, with the choices for the conflict. */
export function CompareView({ name, disk, mine, onReload, onKeep, onClose }: Props) {
  const view = useMemo(() => foldUnchanged(diffLines(splitLines(disk), splitLines(mine))), [disk, mine]);
  const changed = view.some((l) => l.kind === "add" || l.kind === "del");
  return (
    <div className="compare-backdrop" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <section className="compare" role="dialog" aria-modal="true" aria-label={`Compare ${name}`}>
        <header className="compare-head">
          <span className="compare-title">
            <strong>Compare {name}</strong>
            <span className="muted">The file on disk changed while you had unsaved edits.</span>
          </span>
          <span className="compare-legend">
            <span className="diff-del">− On disk</span>
            <span className="diff-add">+ Your edits</span>
          </span>
          <button className="icon-btn" aria-label="Close" onClick={onClose} autoFocus>
            <Icon name="close" />
          </button>
        </header>
        <div className="compare-body">
          {!changed && <p className="muted">The Markdown is the same; only line endings or the final line break differ.</p>}
          {view.map((line, i) =>
            line.kind === "skip" ? (
              <div key={i} className="diff-skip">
                {line.count} unchanged {line.count === 1 ? "line" : "lines"}
              </div>
            ) : (
              <div key={i} className={`diff-line diff-${line.kind}`}>
                <span className="diff-mark">{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}</span>
                {line.text || " "}
              </div>
            ),
          )}
        </div>
        <footer className="compare-foot">
          <span className="muted">Reload drops your edits. Keep writes your edits over the file on disk.</span>
          <button className="text-btn" onClick={onReload}>
            Reload from disk
          </button>
          <button className="text-btn primary" onClick={onKeep}>
            Keep my version
          </button>
        </footer>
      </section>
    </div>
  );
}
