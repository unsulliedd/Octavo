import { useEffect, useRef, useState, type RefObject } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IMAGE_TYPES } from "@/files/images";
import { basename, MD } from "@/lib/paths";
import type { Colors } from "@/settings/colors";
import { loadLastVersion, save } from "@/settings/storage";
import { showAfterUpdate } from "@/updates/whatsNew";

const IMAGE_FILE = new RegExp(`\\.(${IMAGE_TYPES.join("|")})$`, "i");

/** What the window's listeners call, always the latest of each. */
export type WindowHandlers = {
  openPath(path: string): unknown;
  openWhatsNew(version: string): Promise<void>;
  reloadSoon(changed: string): void;
  dropImages(files: string[]): boolean;
  confirmWindowClose(): Promise<boolean>;
};

/**
 * The launch and the window's listeners: the app's version, What's new after an update and the file passed on
 * the command line, files opened from outside, changes on disk, drag and drop, and closing the window.
 */
export function useLaunch(latest: RefObject<WindowHandlers>, workspaces: { whenLoaded(): Promise<unknown> | undefined }) {
  const [dragging, setDragging] = useState(false);
  const [version, setVersion] = useState("");
  // Set once the file passed on the command line, if any, has started opening.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // The first launch after an update opens What's new; a file passed on the command line opens after it.
    // Both open as tabs of the workspace that comes back, so that is known first.
    Promise.all([getVersion(), invoke<string | null>("initial_file"), workspaces.whenLoaded()])
      .then(async ([current, p]) => {
        setVersion(current);
        const previous = loadLastVersion();
        save("lastVersion", current);
        if (showAfterUpdate(previous, current)) await latest.current.openWhatsNew(current);
        if (p) latest.current.openPath(p);
      })
      .finally(() => setStarted(true));
    const unlisteners = [
      listen<string>("open-file", (e) => latest.current.openPath(e.payload)),
      listen<string>("doc-changed", (e) => latest.current.reloadSoon(e.payload)),
      getCurrentWebview().onDragDropEvent((e) => {
        const { type } = e.payload;
        setDragging(type === "enter" || type === "over");
        if (type !== "drop") return;
        const images = e.payload.paths.filter((p) => IMAGE_FILE.test(p));
        if (images.length && latest.current.dropImages(images)) return;
        const path = e.payload.paths.find((p) => MD.test(p));
        if (path) latest.current.openPath(path);
      }),
      // Unsaved edits are saved before the window closes; if that fails, the user decides.
      getCurrentWindow().onCloseRequested(async (e) => {
        if (!(await latest.current.confirmWindowClose())) e.preventDefault();
      }),
    ];
    return () => {
      unlisteners.forEach((u) => u.then((off) => off()));
    };
  }, []);

  return { version, started, dragging };
}

/** The window's title, and its own background, which follows the theme; the window shows once `started`. */
export function useWindowLook(appRoot: RefObject<HTMLElement | null>, dark: boolean, colors: Colors, started: boolean, titlePath: string | undefined) {
  const windowShown = useRef(false);

  // The title names the document once it is rendered; while it loads the window is just "Octavo".
  // npm run perf relies on this to time launch → rendered.
  useEffect(() => {
    getCurrentWindow().setTitle(titlePath ? `${basename(titlePath)} — Octavo` : "Octavo");
  }, [titlePath]);

  // The window starts hidden (tauri.conf.json) and is shown once the UI has rendered, so it never appears
  // blank; with a file to open, it starts on the loading screen instead of the home screen. Its own
  // background follows the theme, for the moment a resize uncovers it.
  useEffect(() => {
    const window = getCurrentWindow();
    const color = appRoot.current && getComputedStyle(appRoot.current).getPropertyValue("--chrome").trim();
    if (color) window.setBackgroundColor(color).catch(() => {});
    if (started && !windowShown.current) {
      windowShown.current = true;
      window.show().catch(() => {});
    }
  }, [dark, started, colors]);
}
