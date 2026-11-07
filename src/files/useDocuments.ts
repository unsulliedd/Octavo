import { useEffect, useRef, useState, type RefObject } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { dirname } from "@/lib/paths";
import { shareInFlight } from "@/lib/shared";
import { renderDoc } from "@/reading/renderDoc";
import { loadRecent, save, type RecentFile } from "@/settings/storage";
import { currentEntry, openPaths, openTab, renamePath, samePath, tabFor, type Tabs } from "@/tabs/tabs";
import { message } from "@/ui/dialog";
import { changelogSection, notesPage } from "@/updates/whatsNew";

export type Doc = { path: string; text: string; html: string };

type Options = {
  tabs: Tabs;
  setTabs: (fn: (s: Tabs) => Tabs) => void;
  changeTabs: (fn: (s: Tabs) => Tabs) => void;
  /** The document the shown tab shows. */
  path: string | undefined;
  scroller: RefObject<HTMLElement | null>;
  /** A document read again after a change on disk, with its new text. */
  onReloaded: (file: string, text: string) => void;
};

/** The documents the tabs show, read and rendered: opening them, the recent files, and reading them again after a change on disk. */
export function useDocuments({ tabs, setTabs, changeTabs, path, scroller, onReloaded }: Options) {
  const [recent, setRecent] = useState<RecentFile[]>(loadRecent);
  // Rendered documents by path, for the documents the tabs show.
  const [docs, setDocs] = useState<Record<string, Doc>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  // Documents being read and rendered for openPath, shown with a loading indicator.
  const [opening, setOpening] = useState<string[]>([]);
  // Documents whose editor round trip renders like the file; checked once per load of the file.
  const verified = useRef(new Set<string>());
  const shownPath = useRef(path);
  shownPath.current = path;

  async function load(path: string) {
    const d = await invoke<{ path: string; text: string }>("open_doc", { path });
    const { html, images, math } = await renderDoc(d.text, dirname(d.path), convertFileSrc(""));
    if (math) await import("katex/dist/katex.min.css");
    // Images outside the document's folder (../img.png) load once each file is allowed.
    if (images.length) await invoke("allow_images", { paths: images }).catch(() => {});
    const loaded = { ...d, html };
    verified.current.delete(d.path);
    setDocs((all) => ({ ...all, [d.path]: loaded }));
    setLoadErrors(({ [d.path]: _, ...rest }) => rest);
    return loaded;
  }
  // Opening a file and showing a restored tab can ask for the same document at once (a launch with the
  // file that was open last time); they share one read and render. load only uses state setters, so the
  // first render's copy stays valid. Reloads after a change on disk call load directly to read fresh.
  const loadShared = useRef(shareInFlight((p: string) => load(p))).current;

  /** Puts `file` first in the recent files. */
  const addRecent = (file: string) =>
    setRecent((r) => {
      const next = [{ path: file, at: Date.now() }, ...r.filter((x) => x.path !== file)].slice(0, 12);
      save("recent", next);
      return next;
    });

  /** Switches to the tab showing `path`, or opens it in a new tab; `from` is the tab whose link was clicked. */
  /** Opens `path` in a tab, or switches to the tab that shows it. With `recent`, it joins the recent files. */
  async function openPath(path: string, from?: number, recent = true) {
    const shown = tabFor(tabs, path);
    const cached = shown && docs[currentEntry(shown).path];
    if (!cached) setOpening((all) => [...all, path]);
    try {
      const d = cached || (await loadShared(path));
      changeTabs((s) => openTab(s, d.path, from));
      setError(undefined);
      if (recent) addRecent(d.path);
    } catch (e) {
      setError(String(e));
    } finally {
      if (!cached) setOpening((all) => all.filter((p) => p !== path));
    }
  }

  /**
   * Opens What's new for `version` in a tab: `notes` when given (an update's own release notes), else that
   * version's section of the changelog bundled with the app.
   */
  async function openWhatsNew(version: string, notes?: string, date?: string) {
    try {
      if (notes === undefined) {
        const { default: changelog } = await import("../../CHANGELOG.md?raw");
        const section = changelogSection(changelog, version);
        notes = section?.body ?? "";
        date = section?.date;
      }
      const file = await invoke<string>("write_notes", { version, text: notesPage(version, notes, date) });
      await openPath(file, undefined, false);
    } catch (e) {
      setError(String(e));
    }
  }

  /** Opens the open-source licenses document the build wrote next to the app's frontend. */
  async function openLicenses() {
    try {
      const res = await fetch("/third-party-licenses.md");
      const text = await res.text();
      // An unknown path answers with the app's own page, and the app's files of this type are labelled as HTML, so the text decides.
      if (!res.ok || !text.startsWith("# Open-source licenses")) {
        throw "The open-source licenses are written when Octavo is built; this build doesn't have them.";
      }
      const file = await invoke<string>("write_licenses", { text });
      await openPath(file, undefined, false);
    } catch (e) {
      await message(String(e));
    }
  }

  async function pick() {
    const path = await openDialog({ filters: [{ name: "Markdown", extensions: ["md", "markdown"] }] });
    if (typeof path === "string") openPath(path);
  }

  // A document changed on disk is read again after its writes settle. The shown one keeps its scroll position.
  const reloadTimers = useRef(new Map<string, number>());
  const keepScroll = useRef<number>(undefined);
  function reloadSoon(changed: string) {
    const shown = Object.keys(docs).find((p) => samePath(p, changed));
    if (!shown) return;
    clearTimeout(reloadTimers.current.get(shown));
    reloadTimers.current.set(
      shown,
      window.setTimeout(() => {
        reloadTimers.current.delete(shown);
        if (shown === shownPath.current) keepScroll.current = scroller.current?.scrollTop;
        load(shown).then(
          (d) => onReloaded(shown, d.text),
          (e) => {
            keepScroll.current = undefined;
            setLoadErrors((all) => ({ ...all, [shown]: String(e) }));
          },
        );
      }, 200),
    );
  }

  // Tabs restored from the last session, and history entries, load when they are first shown.
  useEffect(() => {
    if (!path || docs[path] || loadErrors[path]) return;
    loadShared(path).then(
      (d) => d.path !== path && setTabs((s) => renamePath(s, path, d.path)),
      (e) => setLoadErrors((all) => ({ ...all, [path]: String(e) })),
    );
  }, [path, docs, loadErrors]);

  // The documents of the tabs shown are watched for changes on disk.
  // Limitation: a change landing between a document's first read and its folder being watched shows at its next read.
  const watched = openPaths(tabs).join("\n");
  useEffect(() => {
    invoke("watch_docs", { paths: watched ? watched.split("\n") : [] }).catch(() => {});
  }, [watched]);

  return { recent, docs, setDocs, loadErrors, setLoadErrors, error, setError, opening, verified, keepScroll, load, openPath, addRecent, pick, openWhatsNew, openLicenses, reloadSoon };
}
