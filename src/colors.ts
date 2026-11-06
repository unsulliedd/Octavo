// The colors chosen in Settings › Colors. Only colors that differ from the default are kept; the rest come from
// styles.css, where every other color derives from the three base colors.

export const BASES = ["primary", "secondary", "accent"] as const;
export type Base = (typeof BASES)[number];

/** The base colors as styles.css sets them on `:root`. */
export const DEFAULT_BASES: Record<Base, string> = { primary: "#5a0e27", secondary: "#75b7e5", accent: "#d39d3f" };

export type Colors = { base: Partial<Record<Base, string>> };
export const DEFAULT_COLORS: Colors = { base: {} };

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

/** Colors read from storage: unknown keys, values that aren't colors and colors equal to the default are dropped. */
export function sanitizeColors(stored: unknown): Colors {
  const base = (stored as { base?: unknown } | null)?.base;
  if (!base || typeof base !== "object" || Array.isArray(base)) return { base: {} };
  let colors: Colors = { base: {} };
  for (const key of BASES) {
    const value = (base as Record<string, unknown>)[key];
    if (typeof value === "string") colors = withBase(colors, key, parseHex(value));
  }
  return colors;
}

/** The custom property of base color `key` in styles.css. */
export const baseProperty = (key: Base) => `--brand-${key}`;

/** Sets the chosen colors as custom properties on `style`, and removes those of the others so the defaults show. */
export function applyColors(style: CSSStyleDeclaration, colors: Colors) {
  for (const key of BASES) {
    const value = colors.base[key];
    if (value) style.setProperty(baseProperty(key), value);
    else style.removeProperty(baseProperty(key));
  }
}
