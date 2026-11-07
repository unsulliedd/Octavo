// Where Octavo is with an update from GitHub Releases: checking, downloading, ready to install.

/** How long after launch the first check waits, so it doesn't compete with opening documents. */
export const CHECK_DELAY_MS = 5000;

/**
 * `manual` marks a check started from Settings: its outcome is shown there. A check on launch that finds
 * nothing, or fails, says nothing.
 */
export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking"; manual: boolean }
  | { state: "current" }
  | { state: "downloading"; version: string; manual: boolean }
  | { state: "ready"; version: string }
  | { state: "installing"; version: string }
  | { state: "failed"; during: "check" | "download" | "install"; message: string };

export type UpdateEvent =
  | { type: "check"; manual: boolean }
  | { type: "found"; version: string }
  | { type: "none" }
  | { type: "downloaded" }
  | { type: "install" }
  | { type: "failed"; message: string };

/** The status after `event`. Events that don't fit the current status leave it as it is. */
export function nextStatus(status: UpdateStatus, event: UpdateEvent): UpdateStatus {
  switch (event.type) {
    case "check":
      return status.state === "idle" || status.state === "current" || status.state === "failed" ? { state: "checking", manual: event.manual } : status;
    case "found":
      return status.state === "checking" ? { state: "downloading", version: event.version, manual: status.manual } : status;
    case "none":
      return status.state === "checking" ? (status.manual ? { state: "current" } : { state: "idle" }) : status;
    case "downloaded":
      return status.state === "downloading" ? { state: "ready", version: status.version } : status;
    case "install":
      return status.state === "ready" ? { state: "installing", version: status.version } : status;
    case "failed":
      if (status.state === "checking" || status.state === "downloading") {
        if (!status.manual) return { state: "idle" };
        return { state: "failed", during: status.state === "checking" ? "check" : "download", message: event.message };
      }
      return status.state === "installing" ? { state: "failed", during: "install", message: event.message } : status;
  }
}

/** Whether a check or download is under way, so another check would do nothing. */
export const busy = (status: UpdateStatus) => status.state === "checking" || status.state === "downloading" || status.state === "installing";

/** The line under the version in Settings; empty when there is nothing to say. */
export function statusLine(status: UpdateStatus): string {
  switch (status.state) {
    case "idle":
      return "";
    case "checking":
      return "Checking for updates…";
    case "current":
      return "Octavo is up to date.";
    case "downloading":
      return `Downloading Octavo ${status.version}…`;
    case "ready":
      return `Octavo ${status.version} is ready. Restart to install it.`;
    case "installing":
      return `Installing Octavo ${status.version}…`;
    case "failed":
      // A check or download fails mostly without a connection; the updater's own message says little more.
      if (status.during === "check") return "Couldn't check for updates. Check your internet connection and try again.";
      if (status.during === "download") return "Couldn't download the update. Check your internet connection and try again.";
      return `Couldn't install the update: ${status.message}`;
  }
}
