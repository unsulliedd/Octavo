import { useEffect, useRef, useState } from "react";
import { Icon } from "@/ui/icons";
import { useTip } from "@/app/useKeys";
import { FORMAT_GROUPS, type BarAction, type FormatAction, type FormatState } from "./formatInfo";
import { described } from "@/ui/tooltip";

const INFO = new Map(FORMAT_GROUPS.flat().map((b) => [b.action, b]));
const INLINE: BarAction[] = ["bold", "italic", "strike", "code", "link"];
const BLOCKS: BarAction[] = ["h1", "h2", "h3", "bulletList", "orderedList", "taskList", "quote", "codeBlock"];
const INSERTS: BarAction[] = ["table", "image", "footnote", "mathInline", "mathBlock", "rule", "lineBreak", "properties"];

// Buttons keep the editor's selection, so the action applies to it.
const keepFocus = (e: React.MouseEvent) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
};

/** The address field for a new or changed link. Enter applies it, Escape cancels; leaving the field closes it. */
export function LinkField({ initial, onDone, onClose }: { initial: string; onDone: (href?: string) => void; onClose: () => void }) {
  const [href, setHref] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.select(), []);
  return (
    <form
      className="link-field"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(href.trim() || undefined);
      }}
    >
      <input
        ref={field}
        type="url"
        placeholder="https://"
        aria-label="Link address"
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        onBlur={onClose}
      />
    </form>
  );
}

/** The link at the cursor: its address, and buttons to edit, open or remove it. */
export function LinkChip({ href, onEdit, onOpen, onRemove }: { href: string; onEdit: () => void; onOpen: () => void; onRemove: () => void }) {
  const edit = useTip()("Edit the address", "link");
  return (
    <span className="link-chip" data-tip={href}>
      <button className="link-address" onClick={onEdit} {...described(edit)}>
        {href}
      </button>
      <button className="icon-btn small" aria-label={edit} data-tip={edit} onClick={onEdit}>
        <Icon name="pencil" size="inline" />
      </button>
      <button className="icon-btn small" aria-label="Open the link" data-tip="Open the link" onClick={onOpen}>
        <Icon name="openLink" size="inline" />
      </button>
      <button className="icon-btn small danger" aria-label="Remove the link" data-tip="Remove the link" onClick={onRemove}>
        <Icon name="close" size="inline" />
      </button>
    </span>
  );
}

/** A box placed in the editor pane, at a point given in the pane's coordinates. */
export function Floating({ left, top, label, children }: { left: number; top: number; label: string; children: React.ReactNode }) {
  return (
    <div className="floating" role="toolbar" aria-label={label} style={{ left, top }} onMouseDown={keepFocus}>
      {children}
    </div>
  );
}

/** The formatting bar over selected text: inline formats, a link, and a menu of block formats. */
export function FloatingBar({ state, onAction, onLink }: { state: FormatState; onAction: (action: FormatAction) => void; onLink: () => void }) {
  const [menu, setMenu] = useState(false);
  const keysTip = useTip();
  const tip = (action: BarAction) => keysTip(INFO.get(action)!.label, action);
  const button = (action: BarAction) => (
    <button
      key={action}
      className="icon-btn"
      aria-label={tip(action)}
      data-tip={tip(action)}
      aria-pressed={state.active.includes(action)}
      disabled={state.disabled.includes(action)}
      onClick={() => (action === "link" ? onLink() : onAction(action))}
    >
      <Icon name={action} />
    </button>
  );
  return (
    <>
      {INLINE.map(button)}
      <span className="floating-sep" />
      <span className="floating-menu-anchor">
        <button className="floating-text" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          Text
          <Icon name="down" size="inline" />
        </button>
        {menu && (
          <span className="floating-menu" role="menu">
            {BLOCKS.map((action) => (
              <button
                key={action}
                role="menuitemcheckbox"
                aria-checked={state.active.includes(action)}
                {...described(tip(action))}
                onClick={() => {
                  setMenu(false);
                  onAction(action);
                }}
              >
                <Icon name={action} size="inline" />
                {INFO.get(action)!.label}
              </button>
            ))}
            <span className="floating-menu-sep" role="separator" />
            {INSERTS.map((action) => (
              <button
                key={action}
                role="menuitem"
                {...described(tip(action))}
                disabled={state.disabled.includes(action)}
                onClick={() => {
                  setMenu(false);
                  onAction(action);
                }}
              >
                <Icon name={action} size="inline" />
                {INFO.get(action)!.label}
              </button>
            ))}
          </span>
        )}
      </span>
    </>
  );
}
