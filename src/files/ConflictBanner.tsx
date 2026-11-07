import { basename } from "@/lib/paths";
import { Icon } from "@/ui/icons";
import { described } from "@/ui/tooltip";

type Props = {
  path: string;
  onCompare: () => void;
  onReload: () => void;
  onKeep: () => void;
};

/** The shown document changed on disk while it had unsaved edits: compare, reload or keep the edits. */
export function ConflictBanner({ path, onCompare, onReload, onKeep }: Props) {
  return (
    <div className="banner conflict" role="alert">
      <Icon name="warning" size="inline" />
      <span className="conflict-text">
        <strong>{basename(path)} changed on disk.</strong> Your unsaved edits are kept here; nothing was saved.
      </span>
      <span className="conflict-actions">
        <button className="text-btn primary" onClick={onCompare}>
          Compare
        </button>
        <button className="text-btn" {...described("Drop your unsaved edits and show the file as it is on disk")} onClick={onReload}>
          Reload from disk
        </button>
        <button className="text-btn" {...described("Write your edits over the file on disk")} onClick={onKeep}>
          Keep my version
        </button>
      </span>
    </div>
  );
}
