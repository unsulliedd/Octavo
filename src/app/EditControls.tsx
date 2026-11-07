import type { ReactNode } from "react";
import { DocButtons, type DocActions } from "@/editor/FormatBar";
import type { EditorLayout } from "@/editor/layout";
import type { Mode } from "@/files/useEditState";
import { Icon } from "@/ui/icons";
import { described } from "@/ui/tooltip";
import { useTip } from "./useKeys";

type Props = {
  /** A document's tab is shown, and the document has loaded. */
  tab: boolean;
  doc: boolean;
  editing: boolean;
  source: boolean;
  /** The shown document has an edit session. */
  inSession: boolean;
  /** Why the editor can't open the shown document, which then edits in Source mode only. */
  blocked: string | undefined;
  layout: EditorLayout;
  saveStatus: ReactNode;
  docActions: DocActions | undefined;
  onMode: (mode: Mode) => void;
  onToggleEdit: () => void;
};

/** The toolbar's editing controls: the save status and document buttons, Edit, Source and Preview, Done, or Edit. */
export function EditControls({ tab, doc, editing, source, inSession, blocked, layout, saveStatus, docActions, onMode, onToggleEdit }: Props) {
  const tip = useTip();
  return (
    <>
      {editing && layout.status === "toolbar" && <span className="toolbar-status">{saveStatus}</span>}
      {inSession && (!editing || !layout.actionsInBar) && docActions && <DocButtons doc={docActions} />}
      {tab && inSession && (
        <div className="mode-switch" role="group" aria-label="Editing mode">
          <button aria-pressed={editing} disabled={!!blocked} {...described(blocked ? blocked : "Edit the document")} onClick={() => onMode("edit")}>
            <Icon name="pencil" size="inline" />
            Edit
          </button>
          <button aria-pressed={source} {...described(tip("Source: the document's Markdown", "source"))} onClick={() => onMode("source")}>
            <Icon name="code" size="inline" />
            Source
          </button>
          <button aria-pressed={!editing && !source} {...described(tip("Preview: the reading view of your edits", "preview"))} onClick={() => onMode("preview")}>
            <Icon name="preview" size="inline" />
            Preview
          </button>
        </div>
      )}
      {tab && inSession && (
        <button className="done-btn" {...described(tip("Done: save and stop editing", "toggleEdit"))} onClick={onToggleEdit}>
          <Icon name="check" size="inline" />
          Done
        </button>
      )}
      {tab && !inSession && (
        <button className="edit-btn" disabled={!doc} {...described(tip(blocked ? "Edit the Markdown source" : "Edit", "toggleEdit"))} onClick={onToggleEdit}>
          <Icon name="pencil" size="inline" />
          Edit
        </button>
      )}
    </>
  );
}
