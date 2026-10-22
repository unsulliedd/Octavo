import { useState } from "react";
import { Icon } from "./icons";
import { comboOf, conflicts, defaultKeys, isAssignable, keysOf, setKeys, SHORTCUT_GROUPS, type Bindings, type ShortcutId } from "./shortcuts";

type Props = { bindings: Bindings; onChange: (bindings: Bindings) => void };

/**
 * Every changeable shortcut, by group. Clicking an action's keys records the next key press as its shortcut:
 * Escape cancels, Backspace or Delete leaves it without one. Actions that share keys with something else say so.
 */
export function ShortcutSettings({ bindings, onChange }: Props) {
  const [recording, setRecording] = useState<ShortcutId>();
  const [refused, setRefused] = useState<ShortcutId>();
  const clashes = conflicts(bindings);

  function record(id: ShortcutId, e: React.KeyboardEvent) {
    const combo = comboOf(e.nativeEvent);
    if (!combo) return;
    // Tab still moves the focus on, which ends the recording.
    if (combo === "Tab" || combo === "Shift+Tab") return setRecording(undefined);
    e.preventDefault();
    e.stopPropagation();
    if (combo === "Escape") return setRecording(undefined);
    if (combo === "Backspace" || combo === "Delete") onChange(setKeys(bindings, id, []));
    else if (isAssignable(combo)) onChange(setKeys(bindings, id, [combo]));
    else return setRefused(id);
    setRecording(undefined);
  }

  return (
    <div className="settings-section shortcuts">
      <p className="setting-hint">Click a shortcut and press the new keys. Escape cancels; Backspace leaves the action without a shortcut.</p>
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} className="shortcut-group" aria-label={group.title}>
          <h3 className="setting-label">{group.title}</h3>
          <ul className="shortcut-list">
            {group.items.map(({ id, label }) => {
              const keys = keysOf(bindings, id);
              const on = recording === id;
              const clash = clashes[id];
              const defaults = defaultKeys(id).join(", ") || "None";
              return (
                <li key={id} className="shortcut-row" data-conflict={!!clash || undefined}>
                  <span className="shortcut-label">
                    {label}
                    {clash && (
                      <span className="shortcut-note">
                        <Icon name="warning" size={13} />
                        Also used by {clash.join(", ")}
                      </span>
                    )}
                    {on && refused === id && <span className="shortcut-note muted">Use Ctrl or Alt with a key, or a function key</span>}
                  </span>
                  <button
                    className="shortcut-keys"
                    data-recording={on || undefined}
                    aria-label={`${label}: ${on ? "press the new keys" : keys.join(", ") || "no shortcut"}. Click to change`}
                    onClick={() => {
                      setRefused(undefined);
                      setRecording(on ? undefined : id);
                    }}
                    onKeyDown={(e) => on && record(id, e)}
                    onBlur={() => on && setRecording(undefined)}
                  >
                    {on ? "Press the new keys…" : keys.length ? keys.map((k) => <kbd key={k}>{k}</kbd>) : "None"}
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Reset to ${defaults}`}
                    title={`Reset to ${defaults}`}
                    hidden={!bindings[id]}
                    onClick={() => onChange(setKeys(bindings, id, defaultKeys(id)))}
                  >
                    <Icon name="revert" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="setting-hint">
        Tab and Shift+Tab (table cells, list indent), Ctrl+] and Ctrl+[ (indent), Enter, Escape, F3 in the find bar and Ctrl+C, X, V and A keep
        their keys.
      </p>
    </div>
  );
}
