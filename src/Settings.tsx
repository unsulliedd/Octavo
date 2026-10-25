import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { Icon, Logo } from "./icons";
import { LINKS } from "./links";
import { Segmented } from "./ReadingSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import type { Prefs } from "./storage";
import { busy, statusLine, type UpdateStatus } from "./updates";

type Props = {
  prefs: Prefs;
  onChange: (prefs: Prefs) => void;
  onClose: () => void;
  version: string;
  update: UpdateStatus;
  onCheckUpdate: () => void;
  onRestart: () => void;
  /** Opens What's new for the running version. */
  onWhatsNew: () => void;
};

const SECTIONS = { reading: "Reading", editing: "Editing", saving: "Saving", shortcuts: "Shortcuts", about: "About" } as const;

/** The About section's links that open in the browser. */
const ABOUT_LINKS = [
  ["Release notes", LINKS.releases],
  ["Source code", LINKS.repository],
  ["Report a problem", LINKS.newIssue],
] as const;

/**
 * The settings beyond the quick reading ones in Reading settings: reading, where the editing tools go, saving, keyboard
 * shortcuts, and About with updates. A list of sections on the left picks the one shown. Closes on Escape or a click
 * beside it.
 */
export function Settings({ prefs, onChange, onClose, version, update, onCheckUpdate, onRestart, onWhatsNew }: Props) {
  const set = (patch: Partial<Prefs>) => onChange({ ...prefs, ...patch });
  const [section, setSection] = useState<keyof typeof SECTIONS>("reading");

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <section className="settings" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="settings-head">
          <strong>Settings</strong>
          <button className="icon-btn" aria-label="Close settings" onClick={onClose} autoFocus>
            <Icon name="close" />
          </button>
        </header>
        <div className="settings-main">
          <nav className="settings-nav" aria-label="Settings sections">
            {Object.entries(SECTIONS).map(([key, label]) => (
              <button
                key={key}
                aria-current={key === section ? "page" : undefined}
                onClick={() => setSection(key as keyof typeof SECTIONS)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="settings-body">
            <div className="settings-title-row">
              <h2 className="settings-title">{SECTIONS[section]}</h2>
              {section === "shortcuts" && (
                <button className="text-btn" disabled={!Object.keys(prefs.shortcuts).length} onClick={() => set({ shortcuts: {} })}>
                  Reset all
                </button>
              )}
            </div>
            {section === "reading" && (
              <div className="settings-section">
                <Segmented
                  label="Open diagrams and images large"
                  value={prefs.openLarge}
                  onPick={(openLarge) => set({ openLarge })}
                  options={[
                    { value: "button", label: "Button" },
                    { value: "click", label: "Click" },
                    { value: "both", label: "Both" },
                  ]}
                  hint="With a button at their top right, a click on them, or both. Tables open from their button."
                />
              </div>
            )}
            {section === "editing" && (
              <div className="settings-section">
                <Segmented
                  label="Formatting bar"
                  value={prefs.formatBar}
                  onPick={(formatBar) => set({ formatBar })}
                  options={[
                    { value: "toolbar", label: "Under toolbar" },
                    { value: "floating", label: "Floating" },
                    { value: "both", label: "Both" },
                    { value: "hidden", label: "Hidden" },
                  ]}
                  hint="Under the toolbar, floating over selected text, both, or hidden (keyboard shortcuts only)."
                />
                <Segmented
                  label="Formatting bar position"
                  value={prefs.formatBarAlign}
                  onPick={(formatBarAlign) => set({ formatBarAlign })}
                  options={[
                    { value: "left", label: "Left" },
                    { value: "center", label: "Center" },
                  ]}
                />
                <Segmented
                  label="Table tools"
                  value={prefs.tableBar}
                  onPick={(tableBar) => set({ tableBar })}
                  options={[
                    { value: "above", label: "Above table" },
                    { value: "side", label: "Left side" },
                  ]}
                  hint="On the left side, the tools follow you while you scroll and stay next to the table."
                />
                <Segmented
                  label="Link details"
                  value={prefs.linkDetails}
                  onPick={(linkDetails) => set({ linkDetails })}
                  options={[
                    { value: "bar", label: "In formatting bar" },
                    { value: "popover", label: "Popover at link" },
                    { value: "both", label: "Both" },
                  ]}
                />
                <Segmented
                  label="Save buttons"
                  value={prefs.saveButtons}
                  onPick={(saveButtons) => set({ saveButtons })}
                  options={[
                    { value: "bar", label: "Formatting bar" },
                    { value: "toolbar", label: "Toolbar" },
                  ]}
                  hint="With the formatting bar floating or hidden, they are in the toolbar."
                />
                <Segmented
                  label="Save status"
                  value={prefs.saveStatus}
                  onPick={(saveStatus) => set({ saveStatus })}
                  options={[
                    { value: "status", label: "Status bar" },
                    { value: "toolbar", label: "Toolbar" },
                    { value: "bar", label: "Formatting bar" },
                  ]}
                />
              </div>
            )}
            {section === "saving" && (
              <div className="settings-section">
                <label className="setting-row">
                  <span>
                    Save edits automatically
                    <span className="setting-hint">A second after you stop typing, and before a tab or the window closes.</span>
                  </span>
                  <input type="checkbox" checked={prefs.autosave} onChange={(e) => set({ autosave: e.target.checked })} />
                </label>
                <label className="setting-row">
                  <span>
                    Back up files before the first save
                    <span className="setting-hint">A copy of each file as it was, kept for 30 days.</span>
                  </span>
                  <input type="checkbox" checked={prefs.backups} onChange={(e) => set({ backups: e.target.checked })} />
                </label>
                <div className="setting-row">
                  <span className="setting-hint">The backups folder is in Octavo's data folder.</span>
                  <button
                    className="text-btn with-icon"
                    onClick={() => invoke("open_backups").catch((e) => message(String(e), { kind: "error" }))}
                  >
                    <Icon name="folder" size={14} />
                    Open folder
                  </button>
                </div>
              </div>
            )}
            {section === "shortcuts" && <ShortcutSettings bindings={prefs.shortcuts} onChange={(shortcuts) => set({ shortcuts })} />}
            {section === "about" && (
              <div className="settings-section">
                <div className="about-head">
                  <Logo size={48} />
                  <span>
                    <strong>Octavo</strong>
                    <span className="setting-hint">Version {version} · Markdown reader and editor for Windows</span>
                  </span>
                </div>
                <div className="about-links" role="group" aria-label="Links">
                  <button className="text-btn" onClick={onWhatsNew}>
                    What's new
                  </button>
                  {ABOUT_LINKS.map(([label, url]) => (
                    <button key={label} className="text-btn with-icon" onClick={() => void openUrl(url)}>
                      {label}
                      <Icon name="external" size={12} />
                    </button>
                  ))}
                </div>
                <span className="setting-hint">
                  Free and open source under the MIT license. © 2026 unsulliedd.{" "}
                  <button className="link-btn" onClick={() => void openUrl(LINKS.license)}>
                    License
                  </button>
                </span>
                <div className="about-updates">
                  <span className="setting-label">Updates</span>
                  <label className="setting-row">
                    <span>
                      Check for updates when Octavo starts
                      <span className="setting-hint">A newer release downloads in the background and installs when you restart Octavo.</span>
                    </span>
                    <input type="checkbox" checked={prefs.checkUpdates} onChange={(e) => set({ checkUpdates: e.target.checked })} />
                  </label>
                  <div className="setting-row">
                    <span aria-live="polite">{statusLine(update) || "Look for a newer release now."}</span>
                    {update.state === "ready" || update.state === "installing" ? (
                      <button className="text-btn primary" disabled={update.state === "installing"} onClick={onRestart}>
                        Restart now
                      </button>
                    ) : (
                      <button className="text-btn" disabled={busy(update)} onClick={onCheckUpdate}>
                        Check now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
