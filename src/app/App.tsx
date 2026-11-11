import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { editorLayout } from "@/editor/layout";
import { CompareView } from "@/files/CompareView";
import { ConflictBanner } from "@/files/ConflictBanner";
import { editActions } from "@/files/editActions";
import { eolLabel, fileFormat } from "@/files/fileText";
import { SaveStatus } from "@/files/SaveStatus";
import { useDocuments } from "@/files/useDocuments";
import { useEditState } from "@/files/useEditState";
import { Home } from "@/home/Home";
import { releaseUrl } from "@/lib/links";
import { basename } from "@/lib/paths";
import { widenBlocks } from "@/reading/breakout";
import { DocumentColumn } from "@/reading/DocumentColumn";
import { EdgeRail } from "@/reading/EdgeRail";
import { FindBar } from "@/reading/FindBar";
import { LargeViewer } from "@/reading/LargeViewer";
import { Outline } from "@/reading/Outline";
import { applyWidths } from "@/reading/tableResize";
import { useReadingMenu } from "@/reading/useReadingMenu";
import { useReadingView } from "@/reading/useReadingView";
import { ReadingSettings } from "@/settings/ReadingSettings";
import { Settings } from "@/settings/Settings";
import { save, tabsKey, type LineWidth } from "@/settings/storage";
import { usePrefs } from "@/settings/usePrefs";
import { tabMenuItems } from "@/tabs/tabMenuItems";
import { activate, currentEntry, cycle, goHome, historyTarget, openPaths, reopenTab, toStored } from "@/tabs/tabs";
import { tabListItems, TabStrip } from "@/tabs/tabStrip";
import { useTabs } from "@/tabs/useTabs";
import { useTabStrip } from "@/tabs/useTabStrip";
import { Icon } from "@/ui/icons";
import { Sidebar } from "@/ui/Sidebar";
import { TabMenu } from "@/ui/TabMenu";
import { UpdatePopover } from "@/updates/UpdatePopover";
import { useUpdates } from "@/updates/useUpdates";
import { addToItem, FilesPanel, WorkspaceMenu } from "@/workspaces/FilesPanel";
import { QuickOpen } from "@/workspaces/QuickOpen";
import { useWorkspaces } from "@/workspaces/useWorkspaces";
import { EditControls } from "./EditControls";
import { keyLabel, withKeys, type Action, type ShortcutId } from "./shortcuts";
import { StatusBar } from "./StatusBar";
import { KeysContext } from "./useKeys";
import { useShortcuts } from "./useShortcuts";
import { useLaunch, useWindowLook, type WindowHandlers } from "./useWindow";

const WIDTHS: Record<LineWidth, string> = { narrow: "600px", medium: "720px", default: "920px", wide: "1120px", wider: "1320px" };

/** What the window listeners and the workspace callbacks call: the handlers of the latest render. */
type Latest = WindowHandlers & {
  writeDoc: (file: string, target?: string) => Promise<string | undefined>;
  writeTick: (file: string, offset: number) => Promise<string | undefined>;
  tickTask: (file: string, offset: number) => Promise<string | undefined>;
  confirmSwitch: () => Promise<boolean>;
  showTabSet: (id?: string, carry?: string) => void;
  changedOnDisk: (file: string, disk: string) => void;
};

export default function App() {
  const { prefs, changePrefs, dark } = usePrefs();
  const [showSettings, setShowSettings] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  // Window-level listeners are registered once; they call the latest handlers through this ref.
  const latest = useRef<Latest>(null!);
  const updates = useUpdates(prefs.checkUpdates);
  const workspaces = useWorkspaces(
    prefs.showHidden,
    () => latest.current.confirmSwitch(),
    (id, carry) => latest.current.showTabSet(id, carry),
  );
  // The sidebar tab picked by hand; opening or closing a workspace clears it.
  const [sidebarTab, setSidebarTab] = useState<"files" | "outline">();
  const [focusMode, setFocusMode] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const article = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLElement>(null);
  const tabStrip = useRef<HTMLElement>(null);
  const appRoot = useRef<HTMLDivElement>(null);

  const { version, started, dragging } = useLaunch(latest, workspaces);
  const { tabs, setTabs, changeTabs, go, tab, path, saveScrollSoon, keepTabSet } = useTabs(scroller);
  const strip = useTabStrip(tabs, changeTabs, tabStrip);
  const documents = useDocuments({ tabs, setTabs, changeTabs, path, scroller, onReloaded: (file, text) => latest.current.changedOnDisk(file, text) });
  const { recent, docs, setDocs, loadErrors, setLoadErrors, error, setError, opening, openPath, openWhatsNew, openLicenses, pick } = documents;
  const edit = useEditState();
  const { editingTabs, sourceTabs, saveStates, editBlocked, editorLoads, editorShown } = edit;

  const doc = path ? docs[path] : undefined;
  const lineEndings = useMemo(() => (doc ? eolLabel(fileFormat(doc.text)) : ""), [doc?.text]);
  const draft = path ? edit.drafts[path] : undefined;
  const saveState = path ? saveStates[path] : undefined;
  const editing = !!(tab && doc && path && editingTabs.includes(tab.id) && !editBlocked[path]);
  const source = !!(tab && doc && path && sourceTabs.includes(tab.id));
  // The reading view shows the edits, once they are rendered.
  const shownHtml = draft ? draft.html : doc?.html;
  const editorKey = path && `${path}:${editorLoads[path] ?? 0}`;
  const editorReady = editing && editorShown?.key === editorKey;
  const readingMenu = useReadingMenu(article, !!doc && !editorReady && !source && shownHtml !== undefined, basename(path ?? ""), (e) => setError(String(e)));
  // The sidebar has the Files and Outline tabs only while the outline is in it.
  const outlineInSidebar = prefs.showOutline && prefs.outlineAt === "sidebar";
  const filesShown = !outlineInSidebar || !tab || (sidebarTab ?? (workspaces.open ? "files" : "outline")) === "files";

  const reading = useReadingView({
    article,
    scroller,
    tabStrip,
    sourceEditor: edit.sourceEditor,
    sourceHeadingStarts: edit.sourceHeadingStarts,
    prefs,
    dark,
    tab,
    path,
    doc,
    shownHtml,
    editing,
    source,
    editorReady,
    editorShown,
    keepScroll: documents.keepScroll,
    saveScrollSoon,
    openPath,
    tickable: !!path && prefs.tickTasks && edit.canTick(path),
    tickTask: (file, offset) => latest.current.tickTask(file, offset),
  });
  const { headings, activeId, find, setFind, large, setLarge, goToHeading } = reading;

  const actions = editActions({
    edit,
    docs,
    setDocs,
    load: documents.load,
    verified: documents.verified,
    addRecent: documents.addRecent,
    setError,
    tabs,
    tab,
    changeTabs,
    path,
    doc,
    editing,
    source,
    editorReady,
    editorKey,
    prefs,
    article,
    currentAnchor: reading.currentAnchor,
    pendingAnchor: reading.pendingAnchor,
    restoreAnchor: reading.restoreAnchor,
    showSourceHeadings: reading.showSourceHeadings,
    reloadSoon: documents.reloadSoon,
    holdScroll: documents.holdScroll,
    latest,
  });
  const { saveDoc, closeTabById, unsavedAt, docActions } = actions;

  /**
   * Shows the tabs of workspace `id`, or those of no workspace, after `confirmSwitch`. Edit sessions end, and
   * the documents are read again when shown, so a change made to one while its tab was away is seen then. A
   * document to `carry` is opened as a tab of those shown, or shown if one has it.
   */
  function showTabSet(id?: string, carry?: string) {
    if (id === tabs.workspace) return;
    edit.updateOriginals(() => ({}));
    edit.setEditingTabs([]);
    edit.setSourceTabs([]);
    edit.setSaveStates({});
    setDocs({});
    setLoadErrors({});
    keepTabSet(id, carry);
  }

  /** Restart now: unsaved edits are handled as when the window closes, then the downloaded update installs. */
  async function restartToUpdate() {
    if (!(await actions.confirmWindowClose())) return;
    await updates.install();
  }

  /** Distraction-free mode hides toolbar, outline and status bar while a document is shown. */
  function setFocus(on: boolean) {
    setFocusMode(on && !!tab);
    if (on) setShowSettings(false);
  }

  function runShortcut(action: Action) {
    const run: Record<Action, () => void> = {
      open: pick,
      find: () => reading.openFind(),
      replace: () => reading.openFind(true),
      quickOpen: () => setQuickOpen(true),
      toggleFiles: () => (tab || workspaces.open) && changePrefs({ ...prefs, outline: !prefs.outline }),
      closeTab: () => tab && closeTabById(tab.id),
      reopenTab: () => changeTabs(reopenTab),
      nextTab: () => changeTabs((s) => cycle(s, 1)),
      previousTab: () => changeTabs((s) => cycle(s, -1)),
      back: () => go(-1),
      forward: () => go(1),
      toggleEdit: () => void actions.toggleEdit(),
      preview: () => void actions.togglePreview(),
      source: () => void actions.toggleSource(),
      save: () => path && void saveDoc(path),
      saveAs: () => void actions.saveAs(),
      toggleFocus: () => setFocus(!focusMode),
      exitFocus: () => setFocus(false),
    };
    run[action]();
  }

  const state = { focusMode, findOpen: find.open, settingsOpen: showSettings || showAppSettings };
  const bindings = prefs.shortcuts;
  /** A tooltip with the action's current keys after it. */
  const tip = (label: string, id: ShortcutId) => withKeys(label, bindings, id);
  const focusKey = keyLabel(bindings, "toggleFocus");
  latest.current = {
    openPath,
    openWhatsNew,
    reloadSoon: documents.reloadSoon,
    writeDoc: actions.writeDoc,
    writeTick: actions.writeTick,
    tickTask: actions.tickTask,
    confirmWindowClose: actions.confirmWindowClose,
    confirmSwitch: actions.confirmSwitch,
    showTabSet,
    changedOnDisk: actions.changedOnDisk,
    dropImages: actions.dropImages,
  };
  useShortcuts(bindings, state, !!large || quickOpen, runShortcut);
  const openFromTree = useCallback((file: string) => void latest.current.openPath(file), []);

  // Keep only the documents a tab shows; remember the tabs for the next launch.
  useEffect(() => {
    const shown = new Set(openPaths(tabs));
    setDocs((all) => {
      const kept = Object.entries(all).filter(([p]) => shown.has(p));
      return kept.length === Object.keys(all).length ? all : Object.fromEntries(kept);
    });
    const open = (ids: number[]) => (ids.every((id) => tabs.tabs.some((t) => t.id === id)) ? ids : ids.filter((id) => tabs.tabs.some((t) => t.id === id)));
    edit.setEditingTabs(open);
    edit.setSourceTabs(open);
    save(tabsKey(tabs.workspace), toStored(tabs));
  }, [tabs]);

  useWindowLook(appRoot, dark, prefs.colors, started, doc ? path : undefined);

  useEffect(() => setSidebarTab(undefined), [workspaces.open?.id]);

  // The home screen always shows the toolbar.
  useEffect(() => {
    if (!tab) setFocusMode(false);
  }, [tab]);

  const layout = editorLayout(prefs);
  const inSession = !!path && edit.originals[path] !== undefined;
  const saveStatus = (
    <SaveStatus conflict={!!path && edit.conflicts[path] !== undefined} saveState={saveState} editing={editing || source} onSave={() => void saveDoc(path!)} />
  );

  const rootStyle = { "--doc-size": `${prefs.size}px`, "--doc-width": WIDTHS[prefs.width] } as CSSProperties;

  const updateReady = updates.status.state === "ready" || updates.status.state === "installing" ? updates.status : undefined;

  const sidebarButton = (
    <button className="icon-btn" aria-label="Show sidebar" aria-pressed={prefs.outline} onClick={() => changePrefs({ ...prefs, outline: !prefs.outline })}>
      <Icon name="sidebar" />
    </button>
  );
  /** The dashes of an outline that floats from the left or right margin of the text, when it is there. */
  const outlineRail = (side: "left" | "right") =>
    prefs.showOutline && prefs.outlineAt === side && doc && !focusMode && (
      <EdgeRail side={side} label="Show outline panel" panelLabel="Outline" dashes={reading.headingDashes} width={prefs.sidebarWidth} onJump={goToHeading}>
        {outlinePanel}
      </EdgeRail>
    );
  const outlinePanel = doc && <Outline headings={headings} activeId={activeId} onJump={goToHeading} />;

  const view = (
    <div
      ref={appRoot}
      className="app"
      data-theme={dark ? "dark" : "light"}
      data-font={prefs.font}
      data-hide-properties={!prefs.properties || undefined}
      data-focus={focusMode || undefined}
      style={rootStyle}
    >
      <header className="toolbar">
        {tabs.tabs.length ? (
          <>
            <button className="icon-btn" aria-label="Home" aria-pressed={!tab} onClick={() => changeTabs(goHome)}>
              <Icon name="home" />
            </button>
            {(tab || workspaces.open) && sidebarButton}
            <button className="icon-btn" aria-label={tip("Back", "back")} disabled={!tab || !historyTarget(tabs, -1)} onClick={() => go(-1)}>
              <Icon name="back" />
            </button>
            <button className="icon-btn" aria-label={tip("Forward", "forward")} disabled={!tab || !historyTarget(tabs, 1)} onClick={() => go(1)}>
              <Icon name="forward" />
            </button>
            <TabStrip
              tabs={tabs}
              shown={tab?.id}
              strip={tabStrip}
              draggedTab={strip.draggedTab}
              menuTab={strip.tabMenu?.id}
              overflowing={strip.tabsOverflow}
              listOpen={!!strip.tabList}
              unsaved={unsavedAt}
              onActivate={(id) => changeTabs((s) => activate(s, id))}
              onClose={closeTabById}
              onMenu={strip.setTabMenu}
              onStartDrag={strip.startTabDrag}
              onOpenFile={pick}
              onToggleList={(box) => strip.setTabList((l) => (l ? undefined : { x: box.right - 250, y: box.bottom + 4 }))}
            />
          </>
        ) : (
          <>
            {workspaces.open && sidebarButton}
            <span className="brand">Octavo</span>
          </>
        )}
        <span className="spacer" />
        <EditControls
          tab={!!tab}
          doc={!!doc}
          editing={editing}
          source={source}
          inSession={inSession}
          blocked={path ? editBlocked[path] : undefined}
          layout={layout}
          saveStatus={saveStatus}
          docActions={docActions}
          onMode={(mode) => void actions.setMode(mode)}
          onToggleEdit={() => void actions.toggleEdit()}
        />
        {tab && <span className="toolbar-sep wide" />}
        {tab && (
          <button className="icon-btn" aria-label={tip("Find in document", "find")} aria-expanded={find.open} onClick={() => reading.openFind()}>
            <Icon name="search" />
          </button>
        )}
        {updates.offered && (
          <button className="update-btn" data-update-toggle aria-expanded={showUpdate} onClick={() => setShowUpdate((s) => !s)}>
            <span className="unsaved-dot" />
            Update ready
          </button>
        )}
        <button
          className="icon-btn"
          data-settings-toggle
          aria-label="Reading settings"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((s) => !s)}
        >
          <Icon name="type" />
        </button>
        <button className="icon-btn" aria-label="Settings" aria-expanded={showAppSettings} onClick={() => setShowAppSettings(true)}>
          <Icon name="settings" />
        </button>
      </header>
      {editing && <div className="format-slot" ref={edit.setFormatSlot} />}

      <div className="body">
        {prefs.outline && (doc || workspaces.open) && (
          <Sidebar width={prefs.sidebarWidth} onWidth={(sidebarWidth) => changePrefs({ ...prefs, sidebarWidth })}>
            {outlineInSidebar && (
              <div className="sidebar-tabs">
                <div className="seg" role="group" aria-label="Sidebar">
                  <button aria-pressed={filesShown} onClick={() => setSidebarTab("files")}>
                    Files
                  </button>
                  <button aria-pressed={!filesShown} disabled={!tab} onClick={() => setSidebarTab("outline")}>
                    Outline
                  </button>
                </div>
              </div>
            )}
            {filesShown ? <FilesPanel ws={workspaces} document={path} onOpen={openFromTree} /> : outlinePanel}
          </Sidebar>
        )}
        {outlineRail("left")}
        {tab ? (
          <>
            <main className="reader" ref={scroller} onScroll={reading.onScroll}>
              {(error ?? (path && loadErrors[path])) && <p className="error banner">{error ?? (path && loadErrors[path])}</p>}
              {path && editBlocked[path] && <p className="notice banner">{editBlocked[path]}</p>}
              {path && edit.conflicts[path] !== undefined ? (
                <ConflictBanner path={path} onCompare={() => actions.openCompare(path)} onReload={() => actions.reloadFromDisk(path)} onKeep={() => actions.keepMine(path)} />
              ) : (
                saveState?.message && <p className="error banner">{saveState.message}</p>
              )}
              {doc && path && (
                <DocumentColumn
                  doc={doc}
                  draft={draft}
                  dark={dark}
                  source={source}
                  editing={editing}
                  editorReady={editorReady}
                  editorKey={editorKey!}
                  shownHtml={shownHtml}
                  prefs={prefs}
                  article={article}
                  onDocClick={reading.onDocClick}
                  onContextMenu={readingMenu.onContextMenu}
                  sourcePane={() => actions.sourcePaneProps(path, doc, draft)}
                  editorPane={() => actions.editorPaneProps(path, doc, draft)}
                  formatSlot={edit.formatSlot}
                  layout={layout}
                  saveStatus={saveStatus}
                  onOpenLink={reading.followLink}
                />
              )}
            </main>
            {find.open && doc && (
              <FindBar
                find={find}
                onChange={(change) => setFind((f) => ({ ...f, ...change }))}
                target={edit.findTarget(source, editorReady)}
                root={article}
                scroller={scroller}
                content={reading.rendered}
                onClose={reading.closeFind}
              />
            )}
            {edit.compare && (
              <CompareView
                name={basename(edit.compare.file)}
                disk={edit.compare.disk}
                mine={edit.compare.mine}
                onReload={() => actions.reloadFromDisk(edit.compare!.file)}
                onKeep={() => actions.keepMine(edit.compare!.file)}
                onClose={() => edit.setCompare(undefined)}
              />
            )}
            {dragging && <div className="drop-overlay">{editorReady ? "Drop an image to insert it, or a document to open it" : "Drop to open"}</div>}
          </>
        ) : (
          <Home
            recent={recent}
            pinned={workspaces.pinned}
            dragging={dragging}
            error={error}
            workspaces={workspaces.workspaces}
            openWorkspace={workspaces.open}
            onPick={pick}
            onPickFolder={() => void workspaces.pickFolder()}
            onOpen={(p) => openPath(p)}
            onOpenWorkspace={(id) => void workspaces.openWorkspace(id)}
            onNewWorkspace={() => void workspaces.createWorkspace()}
            onRemoveWorkspace={(id) => void workspaces.removeWorkspace(id)}
            onRenameWorkspace={(id) => void workspaces.rename(id)}
            coverUrl={workspaces.coverUrl}
            onChooseCover={workspaces.chooseCover}
            onRemoveCover={workspaces.removeCover}
            addTo={(item) => addToItem(workspaces, item)}
            onTogglePin={(p) => void workspaces.togglePin(p)}
            onError={(m) => setError(m)}
          />
        )}
        {outlineRail("right")}
        {(opening.length > 0 || (path && !doc && !loadErrors[path])) && (
          <div className="loading" data-solid={(!tab && !workspaces.open) || undefined} role="status">
            <span className="spinner" aria-hidden="true" />
            <span>Opening {basename(opening[opening.length - 1] ?? path ?? "")}…</span>
          </div>
        )}
        {focusMode && (
          <p className="focus-hint" role="status">
            Press {focusKey && <><kbd>{focusKey}</kbd> or </>}<kbd>Esc</kbd> to show the toolbar
          </p>
        )}
        {showAppSettings && (
          <Settings
            prefs={prefs}
            dark={dark}
            onChange={changePrefs}
            onClose={() => setShowAppSettings(false)}
            version={version}
            update={updates.status}
            onCheckUpdate={updates.checkNow}
            onRestart={() => void restartToUpdate()}
            onWhatsNew={() => {
              setShowAppSettings(false);
              void openWhatsNew(version);
            }}
            onLicenses={() => {
              setShowAppSettings(false);
              void openLicenses();
            }}
          />
        )}
        {strip.tabMenu && tabs.tabs.some((t) => t.id === strip.tabMenu!.id) && (
          <TabMenu
            name={basename(currentEntry(tabs.tabs.find((t) => t.id === strip.tabMenu!.id)!).path)}
            x={strip.tabMenu.x}
            y={strip.tabMenu.y}
            items={tabMenuItems(tabs, strip.tabMenu.id, {
              bindings,
              workspaces,
              closeTab: closeTabById,
              closeTabs: actions.closeTabsById,
              changeTabs,
              onError: (e) => setError(String(e)),
            })}
            onClose={strip.closeTabMenu}
          />
        )}
        {readingMenu.menu}
        {strip.tabList && (
          <TabMenu
            name="Open documents"
            x={strip.tabList.x}
            y={strip.tabList.y}
            items={tabListItems(tabs, tab?.id, unsavedAt, (id) => changeTabs((s) => activate(s, id)))}
            onClose={strip.closeTabList}
          />
        )}
        <WorkspaceMenu ws={workspaces} />
        {showUpdate && updates.offered && updateReady && (
          <UpdatePopover
            version={updateReady.version}
            installing={updateReady.state === "installing"}
            onRestart={() => void restartToUpdate()}
            onLater={() => {
              updates.dismiss();
              setShowUpdate(false);
            }}
            notesInApp={!!updates.notes}
            onWhatsNew={() => {
              setShowUpdate(false);
              if (updates.notes) void openWhatsNew(updateReady.version, updates.notes, updates.date);
              else void openUrl(releaseUrl(updateReady.version));
            }}
            onClose={() => setShowUpdate(false)}
          />
        )}
        {showSettings && (
          <ReadingSettings
            prefs={prefs}
            onChange={changePrefs}
            focusMode={focusMode}
            onFocusMode={tab ? setFocus : undefined}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      <StatusBar workspaces={workspaces} document={doc && { words: reading.words, lineEndings, saveStatus: (!editing || layout.status === "status") && saveStatus }} version={version} />
      {quickOpen && <QuickOpen ws={workspaces} onOpen={(p) => void openPath(p)} onClose={() => setQuickOpen(false)} />}
      {large && (
        <LargeViewer
          content={large}
          onClose={() => setLarge(undefined)}
          onOpenLink={(href) => {
            // A fragment scrolls the document behind the view.
            if (href.startsWith("#")) setLarge(undefined);
            reading.followLink(href);
          }}
          onResizeTable={(index, headers, widths) => {
            const root = article.current;
            const area = scroller.current;
            const table = root?.querySelectorAll("table")[index];
            if (!doc?.path || !root || !area || !table) return;
            reading.storeWidths(doc.path, index, headers, widths);
            applyWidths(table, widths);
            widenBlocks(root, area, prefs.wideBlocks);
          }}
        />
      )}
    </div>
  );

  return <KeysContext.Provider value={bindings}>{view}</KeysContext.Provider>;
}
