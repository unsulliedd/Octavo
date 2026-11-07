// The sidebar's width, in pixels.

export const DEFAULT_SIDEBAR = 252;
export const MIN_SIDEBAR = 180;
const MAX_SIDEBAR = 480;
/** What the sidebar always leaves for the document, so that it stays readable. */
const MIN_DOCUMENT = 520;
/** How far one press of an arrow key moves the sidebar's edge. */
export const SIDEBAR_KEY_STEP = 16;

/** `wanted` kept within the sidebar's limits and what a window of `windowWidth` leaves it. */
export const sidebarWidth = (wanted: number, windowWidth: number) => Math.max(MIN_SIDEBAR, Math.min(wanted, MAX_SIDEBAR, windowWidth - MIN_DOCUMENT));

/** A stored sidebar width, or the default one for anything that isn't a number. */
export const storedSidebarWidth = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_SIDEBAR);
