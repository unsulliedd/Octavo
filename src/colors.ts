// The colors chosen in Settings › Colors. Only colors that differ from the default are kept; the rest come from
// styles.css, where every other color derives from the three base colors.

export const BASES = ["primary", "secondary", "accent"] as const;
export type Base = (typeof BASES)[number];

/** The base colors as styles.css sets them on `:root`. */
export const DEFAULT_BASES: Record<Base, string> = { primary: "#5a0e27", secondary: "#75b7e5", accent: "#d39d3f" };

/** The two sets of roles: one for the light theme, one for the dark. */
export const SETS = ["light", "dark"] as const;
export type ColorSet = (typeof SETS)[number];

/** Base colors shared by both themes, and the roles changed in each theme's set, by custom property. */
export type Colors = { base: Partial<Record<Base, string>>; light: Record<string, string>; dark: Record<string, string> };
export const DEFAULT_COLORS: Colors = { base: {}, light: {}, dark: {} };

export const GROUPS = [
  { key: "window", label: "Window" },
  { key: "document", label: "Document" },
  { key: "links", label: "Links and focus" },
  { key: "selection", label: "Selection and find" },
  { key: "controls", label: "Controls" },
  { key: "warnings", label: "Warnings" },
  { key: "code", label: "Code blocks" },
  { key: "inline", label: "Inline code" },
  { key: "tips", label: "Tooltips and scrollbars" },
] as const;
export type Group = (typeof GROUPS)[number]["key"];

/**
 * A color role: one custom property of styles.css. A role with `from` follows a base color, another role, or picks
 * dark or white by itself ("auto") until it is changed; one without has a fixed default in each theme.
 */
export type Role = { key: string; group: Group; label: string; help?: string; from?: Base | "auto" | string; light?: string; dark?: string };

export const ROLES: readonly Role[] = [
  { key: "--chrome", group: "window", label: "Sidebar background", help: "Also the toolbar and the status bar.", light: "#f3f4f6", dark: "#1b1e22" },
  { key: "--chrome-2", group: "window", label: "Hover background", help: "Buttons and rows under the pointer, and the track of switches.", light: "#e8eaee", dark: "#262a30" },
  { key: "--line", group: "window", label: "Lines", light: "#dde1e6", dark: "#30353c" },
  { key: "--line-strong", group: "window", label: "Field borders", from: "--muted" },
  { key: "--ink", group: "window", label: "Text", light: "#1b1f24", dark: "#e6e8eb" },
  { key: "--muted", group: "window", label: "Muted text", help: "Hints, labels and the status bar.", light: "#57606a", dark: "#9ba3ad" },
  { key: "--doc", group: "document", label: "Page background", help: "Behind the document, Home and these settings.", light: "#ffffff", dark: "#131518" },
  { key: "--outline-mark", group: "document", label: "Outline marks", help: "The dashes beside the document, one per heading.", from: "--muted" },
  { key: "--outline-mark-active", group: "document", label: "Current outline mark", from: "--ink" },
  { key: "--link", group: "links", label: "Link", from: "secondary" },
  { key: "--focus", group: "links", label: "Focus ring", help: "Around the button or field you reach with Tab.", from: "--link" },
  { key: "--select", group: "selection", label: "Selected text", from: "secondary" },
  { key: "--find-match", group: "selection", label: "Find match", from: "accent" },
  { key: "--find-current", group: "selection", label: "Current find match", from: "accent" },
  { key: "--find-current-ink", group: "selection", label: "Current find match text", help: "Dark or white, whichever reads better on the match.", from: "auto" },
  { key: "--control", group: "controls", label: "Checkboxes and sliders", help: "Also the border of a field you are typing in.", from: "primary" },
  { key: "--control-fill", group: "controls", label: "Button fill", help: "Buttons that go ahead, such as Done.", from: "primary" },
  { key: "--control-ink", group: "controls", label: "Button text", help: "Dark or white, whichever reads better on the fill.", from: "auto" },
  { key: "--control-soft", group: "controls", label: "Selected row", help: "The open document in the sidebar, and pressed buttons.", from: "primary" },
  { key: "--control-soft-ink", group: "controls", label: "Selected row text", from: "primary" },
  { key: "--file-markdown", group: "controls", label: "Document icon", help: "The folded corner of Markdown files.", from: "--control" },
  { key: "--drop-soft", group: "controls", label: "Drop target", help: "Where a dragged tab or file will land.", from: "secondary" },
  { key: "--danger", group: "warnings", label: "Danger", help: "Errors, and buttons that delete or discard.", light: "#c4302b", dark: "#ff7b72" },
  { key: "--danger-soft", group: "warnings", label: "Danger under the pointer", help: "Behind a delete or discard button.", from: "--danger" },
  { key: "--brand-accent-ink", group: "warnings", label: "Pins and notices", help: "Pin and folder icons, warnings, and the banner when a file changes on disk.", from: "accent" },
  { key: "--code-bg", group: "code", label: "Code background", light: "#f6f8fa", dark: "#1b1e22" },
  { key: "--code-kw", group: "code", label: "Keywords", help: "Also literals such as true and null.", light: "#a3204a", dark: "#f28baa" },
  { key: "--code-str", group: "code", label: "Strings", light: "#0b7a55", dark: "#8fd6a6" },
  { key: "--code-num", group: "code", label: "Numbers", light: "#a04e00", dark: "#f2b77a" },
  { key: "--code-com", group: "code", label: "Comments", light: "#6a737d", dark: "#8b939d" },
  { key: "--code-fn", group: "code", label: "Function names", light: "#1f5f99", dark: "#8ec8f0" },
  { key: "--code-type", group: "code", label: "Types", help: "Also built-in names.", light: "#7a4e0c", dark: "#e6c079" },
  { key: "--code-attr", group: "code", label: "Attributes", help: "Also properties, variables and tag names.", light: "#0e6e78", dark: "#7fd6d0" },
  { key: "--code-inline-ink", group: "inline", label: "Inline code text", from: "accent" },
  { key: "--code-inline-bg", group: "inline", label: "Inline code background", from: "accent" },
  { key: "--code-inline-line", group: "inline", label: "Inline code border", from: "accent" },
  { key: "--tip", group: "tips", label: "Tooltip background", from: "--ink" },
  { key: "--tip-ink", group: "tips", label: "Tooltip text", from: "--chrome" },
  { key: "--scroll-thumb", group: "tips", label: "Scrollbar", help: "See-through until you set it.", from: "--muted" },
  { key: "--scroll-thumb-hover", group: "tips", label: "Scrollbar under the pointer", from: "--muted" },
];

export const ROLE: Record<string, Role> = Object.fromEntries(ROLES.map((role) => [role.key, role]));

/** What a role follows until it is changed, as its tag reads: "From primary", "From Muted text", "Automatic". */
export function roleTag(role: Role): string | undefined {
  if (!role.from) return undefined;
  return role.from === "auto" ? "Automatic" : `From ${ROLE[role.from]?.label ?? role.from}`;
}

/** The tooltip of a changed role's Reset in `set`. */
export function roleResetTip(role: Role, set: ColorSet): string {
  if (!role.from) return `Reset to ${role[set]}`;
  return role.from === "auto" ? "Reset to automatic" : `Reset to follow ${ROLE[role.from]?.label ?? role.from}`;
}

/** `text` as a `#rrggbb` color in lowercase, widening `#rgb`; undefined for anything else. */
export function parseHex(text: string): string | undefined {
  const s = text.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return undefined;
}

/** `colors` with base color `key` set to `hex`, or back to its default when `hex` is the default or undefined. */
export function withBase(colors: Colors, key: Base, hex: string | undefined): Colors {
  const base = { ...colors.base };
  if (hex === undefined || hex === DEFAULT_BASES[key]) delete base[key];
  else base[key] = hex;
  return { ...colors, base };
}

/** `colors` with role `key` of `set` set to `hex`, or reset when `hex` is undefined or the role's fixed default. */
export function withRole(colors: Colors, set: ColorSet, key: string, hex: string | undefined): Colors {
  const roles = { ...colors[set] };
  if (hex === undefined || hex === ROLE[key]?.[set]) delete roles[key];
  else roles[key] = hex;
  return { ...colors, [set]: roles };
}

/** `colors` with every role of `group` in `set` reset. */
export function withoutGroup(colors: Colors, set: ColorSet, group: Group): Colors {
  const roles = { ...colors[set] };
  for (const role of ROLES) if (role.group === group) delete roles[role.key];
  return { ...colors, [set]: roles };
}

/** Whether any base color or role is changed. */
export const anyChanged = (colors: Colors) => [colors.base, colors.light, colors.dark].some((part) => Object.keys(part).length > 0);

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** Colors read from storage: unknown keys, values that aren't colors and colors equal to the default are dropped. */
export function sanitizeColors(stored: unknown): Colors {
  let colors: Colors = DEFAULT_COLORS;
  const base = record(record(stored).base);
  for (const key of BASES) {
    const value = base[key];
    if (typeof value === "string") colors = withBase(colors, key, parseHex(value));
  }
  for (const set of SETS) {
    const roles = record(record(stored)[set]);
    for (const { key } of ROLES) {
      const value = roles[key];
      if (typeof value === "string") colors = withRole(colors, set, key, parseHex(value));
    }
  }
  return colors;
}

/** The custom property of base color `key` in styles.css. */
export const baseProperty = (key: Base) => `--brand-${key}`;

/**
 * Sets the chosen base colors and the changed roles of the dark or light set as custom properties on `style`, and
 * removes the others so the defaults show. A role set this way stops following its source, and roles that follow
 * it take its color.
 */
export function applyColors(style: CSSStyleDeclaration, colors: Colors, dark: boolean) {
  for (const key of BASES) {
    const value = colors.base[key];
    if (value) style.setProperty(baseProperty(key), value);
    else style.removeProperty(baseProperty(key));
  }
  const roles = colors[dark ? "dark" : "light"];
  for (const { key } of ROLES) {
    if (roles[key]) style.setProperty(key, roles[key]);
    else style.removeProperty(key);
  }
}

let paint: CanvasRenderingContext2D | null | undefined;

/** The background color `el` is drawn with, as `#rrggbb` (alpha left out); undefined where nothing can be drawn. */
export function readColor(el: Element): string | undefined {
  paint ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!paint) return undefined;
  paint.clearRect(0, 0, 1, 1);
  paint.fillStyle = getComputedStyle(el).backgroundColor;
  paint.fillRect(0, 0, 1, 1);
  const [r, g, b] = paint.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
