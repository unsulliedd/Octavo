import type { ReactNode } from "react";
import { Icon } from "../icons";
import { useTip } from "../useKeys";
import { FORMAT_GROUPS, type FormatAction, type FormatState } from "./formatInfo";

/** Saving the document being edited, and reverting it to how it was when editing started. */
export type DocActions = {
  /** Whether there are edits not written to the file. */
  unsaved: boolean;
  save: () => void;
  saveAs: () => void;
  /** Whether the document differs from how it was when editing started. */
  canRevert: boolean;
  revert: () => void;
};

/** Save and Save as… as icons. */
export function SaveButtons({ doc }: { doc: DocActions }) {
  const tip = useTip();
  return (
    <>
      <button className="icon-btn" aria-label={tip("Save", "save")} title={tip("Save", "save")} disabled={!doc.unsaved} onClick={doc.save}>
        <Icon name="save" />
      </button>
      <button className="icon-btn" aria-label={tip("Save as…", "saveAs")} title={tip("Save as…", "saveAs")} onClick={doc.saveAs}>
        <Icon name="saveAs" />
      </button>
    </>
  );
}

export function RevertButton({ doc }: { doc: DocActions }) {
  const tip = "Revert to original: bring the file back to how it was when you started editing";
  return (
    <button className="icon-btn" aria-label="Revert to original" title={tip} disabled={!doc.canRevert} onClick={doc.revert}>
      <Icon name="revert" />
    </button>
  );
}

/** Save, Save as… and Revert to original, for the toolbar. */
export function DocButtons({ doc }: { doc: DocActions }) {
  return (
    <div className="toolbar-actions" role="group" aria-label="Document">
      <SaveButtons doc={doc} />
      <RevertButton doc={doc} />
      <span className="toolbar-sep" />
    </div>
  );
}

type Props = {
  state: FormatState;
  onAction: (action: FormatAction) => void;
  /** Opens the link field. */
  onLink: () => void;
  align: "left" | "center";
  /** The link field or the link at the cursor, after the buttons. */
  link?: ReactNode;
  /** The save status, at the right end; it may be elsewhere. */
  status?: ReactNode;
  /** Save and Save as… next to Undo and Redo, and Revert at the right end; they may be in the toolbar instead. */
  doc?: DocActions;
};

/** The formatting buttons, a row under the toolbar while a document is being edited. */
export function FormatBar({ state, onAction, onLink, align, link, status, doc }: Props) {
  const tip = useTip();
  // The buttons keep the editor's selection, so the format applies to it.
  return (
    <div
      className="format-bar"
      data-align={align}
      role="toolbar"
      aria-label="Formatting"
      onMouseDown={(e) => !(e.target instanceof HTMLInputElement) && e.preventDefault()}
    >
      <div className="format-tools">
        {FORMAT_GROUPS.map((group, i) => (
          <span key={i} className="format-group">
            {group.map((b) => (
              <button
                key={b.action}
                className="icon-btn"
                aria-label={tip(b.label, b.action)}
                title={tip(b.label, b.action)}
                aria-pressed={state.active.includes(b.action)}
                disabled={state.disabled.includes(b.action)}
                onClick={() => (b.action === "link" ? onLink() : onAction(b.action))}
              >
                <Icon name={b.action} />
              </button>
            ))}
            {i === 0 && doc && <SaveButtons doc={doc} />}
          </span>
        ))}
        {link}
      </div>
      {(status || doc) && (
        <div className="format-end">
          {status}
          {doc && <RevertButton doc={doc} />}
        </div>
      )}
    </div>
  );
}
