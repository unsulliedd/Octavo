import { useTip } from "@/app/useKeys";
import { described } from "@/ui/tooltip";
import type { SaveState } from "./useEditState";

const SAVE_LABELS: Record<SaveState["state"], string> = {
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

type Props = {
  /** The file changed on disk while it had unsaved edits. */
  conflict: boolean;
  saveState: SaveState | undefined;
  editing: boolean;
  onSave: () => void;
};

/** The shown document's save state; unsaved changes and failed saves are a button that saves. */
export function SaveStatus({ conflict, saveState, editing, onSave }: Props) {
  const tip = useTip();
  return conflict ? (
    <span className="save-state" data-state="error">
      Changed on disk
    </span>
  ) : saveState?.state === "unsaved" || saveState?.state === "error" ? (
    <button
      className="save-state"
      data-state={saveState.state}
      {...described(saveState.state !== "error" ? tip("Save now", "save") : saveState.refused ? saveState.message : `${saveState.message} Click to try again.`)}
      onClick={onSave}
    >
      {SAVE_LABELS[saveState.state]}
    </button>
  ) : (
    <span className="save-state" data-state={saveState?.state}>
      {saveState ? SAVE_LABELS[saveState.state] : editing ? "Editing" : "Reading"}
    </span>
  );
}
