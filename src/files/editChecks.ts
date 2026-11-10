// Files whose editor round trip renders like the file, remembered between launches by what the file holds.

import { loadEditChecks, save } from "@/settings/storage";

/** How many passed checks are kept; the oldest go first. */
export const KEPT_CHECKS = 200;

/**
 * The key of the check of `text` at `path` by app `version`. Any change to the text, the path or the version
 * gives a different key, so a remembered result never covers a file that changed or an updated app.
 * Limitation: development builds of one version share results, so a change to the editor or reader there
 * doesn't clear them.
 */
export async function checkKey(version: string, path: string, text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${version}\n${path}\n${text}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the check with this key passed before. */
export const passedBefore = (key: string) => loadEditChecks().includes(key);

/** Remembers that the check with this key passed. */
export const rememberPassed = (key: string) => save("editChecks", [key, ...loadEditChecks().filter((k) => k !== key)].slice(0, KEPT_CHECKS));
