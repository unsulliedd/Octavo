import { useEffect, useRef } from "react";
import { Icon } from "./icons";

type Props = {
  version: string;
  installing: boolean;
  /** What's new opens the update's notes in a tab; without notes it opens the release page in the browser. */
  notesInApp: boolean;
  onRestart: () => void;
  onLater: () => void;
  onWhatsNew: () => void;
  onClose: () => void;
};

/** Popover under the toolbar's Update ready button. Closes on Escape or a click outside. */
export function UpdatePopover({ version, installing, notesInApp, onRestart, onLater, onWhatsNew, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!panel.current?.contains(target) && !target.closest("[data-update-toggle]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <section className="popover update-popover" ref={panel} aria-label="Update">
      <div className="update-text">
        <strong>Octavo {version} is ready</strong>
        <span>Restarting saves your edits and installs it.</span>
      </div>
      <button className="link-btn" onClick={onWhatsNew}>
        What's new
        {!notesInApp && <Icon name="external" size={13} />}
      </button>
      <div className="update-actions">
        <button className="text-btn" disabled={installing} onClick={onLater}>
          Later
        </button>
        <button className="text-btn primary" disabled={installing} onClick={onRestart} autoFocus>
          {installing ? "Installing…" : "Restart now"}
        </button>
      </div>
    </section>
  );
}
