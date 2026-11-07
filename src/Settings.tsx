import { invoke } from "@tauri-apps/api/core";
import { ask, message, promptText } from "./dialog";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { ColorSettings } from "./ColorSettings";
import { anyChanged, DEFAULT_COLORS } from "./colors";
import { Icon, Logo, type IconName } from "./icons";
import { basename } from "./Home";
import { LINKS } from "./links";
import { Segmented } from "./ReadingSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import type { Prefs } from "./storage";
import { isThemeError, parseTheme, themeCounts, themeFileName, themeText, type ThemeError } from "./themeFile";
import { busy, statusLine, type UpdateStatus } from "./updates";

type Props = {
  prefs: Prefs;
  /** Whether the dark theme shows now. */
  dark: boolean;
  onChange: (prefs: Prefs) => void;
  onClose: () => void;
  version: string;
  update: UpdateStatus;
  onCheckUpdate: () => void;
  onRestart: () => void;
  /** Opens What's new for the running version. */
  onWhatsNew: () => void;
  /** Opens the open-source licenses document. */
  onLicenses: () => void;
};

const SECTIONS = { reading: "Reading", colors: "Colors", editing: "Editing", saving: "Saving", shortcuts: "Shortcuts", about: "About" } as const;
type Section = keyof typeof SECTIONS;
const SECTION_KEYS = Object.keys(SECTIONS) as Section[];
const SECTION_ICONS: Record<Section, IconName> = { reading: "bookOpen", colors: "palette", editing: "pencil", saving: "save", shortcuts: "keyboard", about: "info" };

/** The window width up to which the dialog is 800 px or narrower and the section list is a rail of icons; as in styles.css. */
const RAIL = "(max-width: 1142px)";

/** Whether the media query matches now, following it as the window changes. */
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const change = () => setMatches(list.matches);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, [query]);
  return matches;
}

/** The section an arrow, Home or End key moves to from `index` in the section list, or undefined for other keys. */
function sectionAfterKey(key: string, index: number, count = SECTION_KEYS.length) {
  if (key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowUp") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
}

/** Check for updates, or Restart now once an update is ready. */
function UpdateButton({ update, label, small, onCheckUpdate, onRestart }: Pick<Props, "update" | "onCheckUpdate" | "onRestart"> & { label: string; small?: boolean }) {
  const size = small ? " small" : "";
  return update.state === "ready" || update.state === "installing" ? (
    <button className={`text-btn primary${size}`} disabled={update.state === "installing"} onClick={onRestart}>
      Restart now
    </button>
  ) : (
    <button className={`text-btn${size}`} disabled={busy(update)} onClick={onCheckUpdate}>
      {label}
    </button>
  );
}

/** The result of the last theme import, shown under the Colors heading until it is closed or the section is left. */
type ThemeNotice = { ok: string } | (ThemeError & { saving?: true });

const THEME_FILTERS = [{ name: "Octavo theme", extensions: ["json"] }];

/** The message of an error a command rejected with. */
const reason = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));

/** The About section's links that open in the browser. */
const ABOUT_LINKS = [
  ["Release notes", LINKS.releases],
  ["Source code", LINKS.repository],
  ["Report a problem", LINKS.newIssue],
] as const;

/**
 * The settings beyond the quick reading ones in Reading settings: reading, colors, where the editing tools go, saving,
 * keyboard shortcuts, and About with updates. A list of sections on the left picks the one shown, with Up, Down, Home and
 * End too, and shows the version and updates at its foot; in a narrow window it is a rail of icons. Closes on Escape or a
 * click beside it.
 */
export function Settings({ prefs, dark, onChange, onClose, version, update, onCheckUpdate, onRestart, onWhatsNew, onLicenses }: Props) {
  const set = (patch: Partial<Prefs>) => onChange({ ...prefs, ...patch });
  const [section, setSection] = useState<Section>("reading");
  const [notice, setNotice] = useState<ThemeNotice>();
  const rail = useMedia(RAIL);
  const tabs = useRef<HTMLDivElement>(null);
  const pick = (next: Section) => {
    setSection(next);
    if (next !== section) setNotice(undefined);
  };

  /** Asks for a name and a file, and saves the colors there. Cancel at either step changes nothing. */
  async function exportTheme() {
    const name = await promptText("The name shows when the theme is imported.", { title: "Export theme", value: "My colors", okLabel: "Export" });
    if (name === undefined) return;
    const path = await saveDialog({ defaultPath: themeFileName(name), filters: THEME_FILTERS });
    if (typeof path !== "string") return;
    try {
      await invoke("write_theme", { path, text: themeText(name, prefs.colors) });
    } catch (e) {
      setNotice({ lead: "The theme couldn't be saved.", detail: reason(e), saving: true });
    }
  }

  /** Reads a theme file and, once confirmed, replaces the colors with its own. */
  async function importTheme() {
    const path = await openDialog({ filters: THEME_FILTERS });
    if (typeof path !== "string") return;
    let text: string;
    try {
      text = await invoke<string>("read_theme", { path });
    } catch (e) {
      setNotice({ lead: "The theme couldn't be opened.", detail: reason(e) });
      return;
    }
    const theme = parseTheme(text, basename(path));
    if (isThemeError(theme)) return setNotice(theme);
    const replace =
      !anyChanged(prefs.colors) ||
      (await ask("Your base colors and the Light and Dark sets become the theme's. To keep the colors you have now, export them first.", {
        title: `Replace your colors with ${theme.name}?`,
        okLabel: "Replace colors",
      }));
    if (!replace) return;
    set({ colors: theme.colors });
    setNotice({ ok: `Imported ${theme.name}: ${themeCounts(theme.colors)}.` });
  }

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
          <nav className="settings-nav">
            <div
              ref={tabs}
              role="tablist"
              aria-orientation="vertical"
              aria-label="Settings sections"
              onKeyDown={(e) => {
                const next = sectionAfterKey(e.key, SECTION_KEYS.indexOf(section));
                if (next === undefined) return;
                e.preventDefault();
                pick(SECTION_KEYS[next]);
                tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
              }}
            >
              {SECTION_KEYS.map((key) => (
                <button
                  key={key}
                  role="tab"
                  id={`settings-tab-${key}`}
                  aria-selected={key === section}
                  aria-controls="settings-panel"
                  tabIndex={key === section ? 0 : -1}
                  data-tip={rail ? SECTIONS[key] : undefined}
                  onClick={() => pick(key)}
                >
                  <Icon name={SECTION_ICONS[key]} />
                  <span className="settings-nav-label">{SECTIONS[key]}</span>
                </button>
              ))}
            </div>
            <div className="settings-nav-foot">
              <span>
                <strong>Octavo</strong> {version}
              </span>
              {/* About reads the same status out itself. */}
              <span className="setting-hint" aria-live={section === "about" ? undefined : "polite"}>
                {statusLine(update)}
              </span>
              <UpdateButton update={update} label="Check for updates" small onCheckUpdate={onCheckUpdate} onRestart={onRestart} />
            </div>
          </nav>
          <div className="settings-body" role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${section}`}>
            <div className="settings-title-row">
              <h2 className="settings-title">{SECTIONS[section]}</h2>
              {section === "shortcuts" && (
                <button className="text-btn" disabled={!Object.keys(prefs.shortcuts).length} onClick={() => set({ shortcuts: {} })}>
                  Reset all
                </button>
              )}
              {section === "colors" && (
                <div className="settings-title-actions">
                  <button className="text-btn" onClick={exportTheme}>
                    Export theme…
                  </button>
                  <button className="text-btn" onClick={importTheme}>
                    Import theme…
                  </button>
                  <button className="text-btn" disabled={!anyChanged(prefs.colors)} onClick={() => set({ colors: DEFAULT_COLORS })}>
                    Reset all colors
                  </button>
                </div>
              )}
            </div>
            {section === "colors" && notice && (
              <div className={"ok" in notice ? "color-notice" : "color-notice bad"} role={"ok" in notice ? "status" : "alert"}>
                <Icon name={"ok" in notice ? "check" : "warning"} size="inline" />
                <span>
                  {"ok" in notice ? (
                    notice.ok
                  ) : (
                    <>
                      <strong>{notice.lead}</strong> {[notice.detail, !notice.saving && "Your colors didn't change."].filter(Boolean).join(" ")}
                    </>
                  )}
                </span>
                <button className="icon-btn small" aria-label="Dismiss" onClick={() => setNotice(undefined)}>
                  <Icon name="close" size="inline" />
                </button>
              </div>
            )}
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
                <label className="setting-row">
                  <span>
                    Show hidden folders
                    <span className="setting-hint">Workspaces also list folders whose names start with a dot, such as .github.</span>
                  </span>
                  <input type="checkbox" checked={prefs.showHidden} onChange={(e) => set({ showHidden: e.target.checked })} />
                </label>
              </div>
            )}
            {section === "colors" && (
              <ColorSettings theme={prefs.theme} onTheme={(theme) => set({ theme })} dark={dark} colors={prefs.colors} onChange={(colors) => set({ colors })} />
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
                    onClick={() => invoke("open_backups").catch((e) => message(String(e)))}
                  >
                    <Icon name="folder" size="inline" />
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
                  <button className="text-btn" onClick={onLicenses}>
                    Open-source licenses
                  </button>
                  {ABOUT_LINKS.map(([label, url]) => (
                    <button key={label} className="text-btn with-icon" onClick={() => void openUrl(url)}>
                      {label}
                      <Icon name="external" size="inline" />
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
                    <UpdateButton update={update} label="Check now" onCheckUpdate={onCheckUpdate} onRestart={onRestart} />
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
