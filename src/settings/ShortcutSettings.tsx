import { Fragment, useRef, useState } from "react";
import { Icon } from "@/ui/icons";
import {
  clashText,
  comboOf,
  conflicts,
  defaultKeys,
  findShortcuts,
  recordKey,
  removeKeys,
  resetGroup,
  setKeys,
  shortcutLabel,
  type Bindings,
  type FoundRow,
  type ShortcutId,
} from "@/app/shortcuts";

type Props = { bindings: Bindings; onChange: (bindings: Bindings) => void };

/**
 * Every changeable shortcut, by group, then the keys that keep their meaning. Clicking an action's keys records the next
 * key press as its shortcut: Escape cancels, Backspace or Delete leaves it without one, and keys that keep their meaning
 * are refused. Actions that share keys say so and can take them off the other action. Find a shortcut narrows the list;
 * while it has text, Escape clears it before it closes Settings.
 */
export function ShortcutSettings({ bindings, onChange }: Props) {
  const [recording, setRecording] = useState<ShortcutId>();
  const [refused, setRefused] = useState<string>();
  const [query, setQuery] = useState("");
  const findField = useRef<HTMLInputElement>(null);
  const clashes = conflicts(bindings);
  const { groups, count } = findShortcuts(query, bindings);
  const typed = query.trim().length;

  function record(id: ShortcutId, e: React.KeyboardEvent) {
    const combo = comboOf(e.nativeEvent);
    if (!combo) return;
    // Tab still moves the focus on, which ends the recording.
    if (combo === "Tab" || combo === "Shift+Tab") return setRecording(undefined);
    e.preventDefault();
    e.stopPropagation();
    const result = recordKey(bindings, id, combo);
    if ("refused" in result) return setRefused(result.refused);
    if ("bindings" in result) onChange(result.bindings);
    setRecording(undefined);
  }

  function row({ id, label, keys, at, caps }: FoundRow) {
    const name = at >= 0 ? (
      <>
        {label.slice(0, at)}
        <mark>{label.slice(at, at + typed)}</mark>
        {label.slice(at + typed)}
      </>
    ) : (
      label
    );
    const capsOf = <KeyCaps keys={keys} caps={caps} />;
    if (!id)
      return (
        <li key={label} className="shortcut-row key-row">
          <span className="shortcut-label">{name}</span>
          <span className="shortcut-keys fixed">{capsOf}</span>
        </li>
      );
    const on = recording === id;
    const clash = on ? undefined : clashes[id];
    const defaults = defaultKeys(id).join(" or ") || "no shortcut";
    const noteId = `shortcut-note-${id}`;
    return (
      <li key={id} className="shortcut-row key-row" data-conflict={!!clash || undefined} data-changed={!!bindings[id] || undefined}>
        <span className="shortcut-label">{name}</span>
        <button
          className="shortcut-keys"
          data-recording={on || undefined}
          aria-label={`${label}: ${on ? "press the new keys" : keys.join(" or ") || "no shortcut"}. Click to change`}
          aria-describedby={on || clash ? noteId : undefined}
          onClick={() => {
            setRefused(undefined);
            setRecording(on ? undefined : id);
          }}
          onKeyDown={(e) => on && record(id, e)}
          onBlur={() => on && setRecording(undefined)}
        >
          {on ? (
            <>
              <span className="shortcut-rec" aria-hidden="true" />
              Press keys…
            </>
          ) : keys.length ? (
            capsOf
          ) : (
            <span className="shortcut-none">None</span>
          )}
          {!on && <Icon name="pencil" size="inline" />}
        </button>
        <button className="icon-btn" aria-label={`Reset ${label}`} data-tip={`Reset to ${defaults}`} hidden={!bindings[id]} onClick={() => onChange(setKeys(bindings, id, defaultKeys(id)))}>
          <Icon name="revert" />
        </button>
        {on && (
          <span className={refused ? "shortcut-note" : "shortcut-note muted"} id={noteId} role={refused ? "alert" : undefined}>
            {refused && <Icon name="warning" size="inline" />}
            {refused ?? "Press the new keys, such as Ctrl+Shift+R. Escape cancels; Backspace removes the shortcut."}
          </span>
        )}
        {clash && (
          <span className="shortcut-notes" id={noteId}>
            {clash.map((c) => (
              <span key={c.keys + c.other} className="shortcut-note">
                <Icon name="warning" size="inline" />
                {clashText(c)}
                {c.other && (
                  <button className="text-btn small" onClick={() => onChange(removeKeys(bindings, c.other!, c.keys))}>
                    Remove from {shortcutLabel(c.other)}
                  </button>
                )}
              </span>
            ))}
          </span>
        )}
      </li>
    );
  }

  return (
    <div
      className="settings-section shortcuts"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !query) return;
        e.stopPropagation();
        setQuery("");
      }}
    >
      <p className="setting-hint">Click a shortcut and press the new keys. Escape cancels; Backspace removes the shortcut.</p>
      <div className="color-band">
        <div className="color-band-bar shortcut-find">
          <div className="shortcut-find-field">
            <label className="setting-label" htmlFor="shortcut-find">
              Find a shortcut
            </label>
            <span className="shortcut-find-box">
              <Icon name="search" size="inline" />
              <input
                ref={findField}
                id="shortcut-find"
                type="text"
                value={query}
                placeholder="Action or keys, such as Ctrl+K"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="shortcut-count"
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="icon-btn small"
                  aria-label="Clear"
                  onClick={() => {
                    setQuery("");
                    findField.current?.focus();
                  }}
                >
                  <Icon name="close" size="inline" />
                </button>
              )}
            </span>
          </div>
          <p className="setting-hint" id="shortcut-count" role="status">
            {query && (count === 1 ? "1 shortcut" : count ? `${count} shortcuts` : "No shortcut matches")}
          </p>
        </div>
      </div>
      {groups.map((group) => (
        <section key={group.title} className="shortcut-group" aria-labelledby={`shortcuts-${group.title}`}>
          <div className="color-group-head">
            <div>
              <h3 id={`shortcuts-${group.title}`} className="setting-label">
                {group.title}
              </h3>
              {group.fixed && <span className="setting-hint">These keys keep their meaning and can't be given to an action.</span>}
            </div>
            {group.ids.some((id) => bindings[id]) && (
              <button className="text-btn small" aria-label={`Reset ${group.title} shortcuts`} onClick={() => onChange(resetGroup(bindings, group.ids))}>
                Reset group
              </button>
            )}
          </div>
          <ul className="shortcut-list">{group.rows.map(row)}</ul>
        </section>
      ))}
    </div>
  );
}

/** Keys as one cap per key, a second shortcut after "or"; caps the find text names are marked. */
function KeyCaps({ keys, caps }: { keys: string[]; caps: string[] }) {
  return keys.map((combo, i) => (
    <Fragment key={combo}>
      {i > 0 && <span className="shortcut-or">or</span>}
      {combo.split("+").map((cap, j) => (
        <kbd key={j} data-hit={caps.includes(cap.toLowerCase()) || undefined}>
          {cap}
        </kbd>
      ))}
    </Fragment>
  ));
}
