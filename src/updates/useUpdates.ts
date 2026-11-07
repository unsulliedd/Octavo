import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useReducer, useRef, useState } from "react";
import { busy, CHECK_DELAY_MS, nextStatus } from "./updates";

/**
 * Checks GitHub Releases for a newer Octavo and downloads it in the background; installing waits for
 * `install`. With `checkOnLaunch`, one check runs shortly after launch. Development builds don't check
 * on launch, so they never offer to replace the installed app.
 */
export function useUpdates(checkOnLaunch: boolean) {
  const [status, dispatch] = useReducer(nextStatus, { state: "idle" });
  const statusRef = useRef(status);
  statusRef.current = status;
  const downloaded = useRef<Update>(undefined);
  // Later hides the toolbar button until the next launch.
  const [dismissed, setDismissed] = useState(false);

  async function checkNow(manual: boolean) {
    if (busy(statusRef.current) || downloaded.current) return;
    dispatch({ type: "check", manual });
    let found: Update | null = null;
    try {
      found = await check();
      if (!found) return dispatch({ type: "none" });
      dispatch({ type: "found", version: found.version });
      await found.download();
      downloaded.current = found;
      dispatch({ type: "downloaded" });
    } catch (e) {
      void found?.close();
      dispatch({ type: "failed", message: String(e) });
    }
  }

  /** Installs the downloaded update. On Windows the app closes, and the installer starts it again. */
  async function install() {
    const update = downloaded.current;
    if (!update) return;
    dispatch({ type: "install" });
    try {
      await update.install();
    } catch (e) {
      downloaded.current = undefined;
      void update.close();
      dispatch({ type: "failed", message: String(e) });
    }
  }

  useEffect(() => {
    if (!checkOnLaunch || import.meta.env.DEV) return;
    const timer = setTimeout(() => void checkNow(false), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
    // Once per launch, with the setting as it was at launch.
  }, []);

  return {
    status,
    /** The toolbar shows Update ready. */
    offered: (status.state === "ready" || status.state === "installing") && !dismissed,
    /** The downloaded update's release notes and date (`YYYY-MM-DD`), as its release published them. */
    notes: downloaded.current?.body,
    date: downloaded.current?.date?.slice(0, 10),
    checkNow: () => void checkNow(true),
    install,
    dismiss: () => setDismissed(true),
  };
}
