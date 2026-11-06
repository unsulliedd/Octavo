// Theme files: the colors of Settings › Colors saved as JSON, to be imported again here or on another computer. A file
// is only ever parsed as data; nothing in it is run or used as a path.

import { sanitizeColors, type Colors } from "./colors";

/** The version of the theme format this Octavo writes and reads. */
export const THEME_VERSION = 1;
/** The largest theme file read, in bytes. */
export const MAX_THEME_BYTES = 64 * 1024;
export const THEME_EXTENSION = ".octavo-theme.json";
const MAX_NAME = 80;

export type Theme = { name: string; colors: Colors };
/** Why a file can't be imported: the sentence in bold, and one after it. */
export type ThemeError = { lead: string; detail?: string };

export const NOT_A_THEME: ThemeError = { lead: "This file isn't an Octavo theme." };
export const NEWER_THEME: ThemeError = { lead: "This theme is from a newer Octavo.", detail: "Update Octavo to import it." };

/** The JSON file for `colors` under `name`, pretty-printed. */
export function themeText(name: string, colors: Colors): string {
  const { base, light, dark } = colors;
  return `${JSON.stringify({ octavoTheme: THEME_VERSION, name, base, light, dark }, null, 2)}\n`;
}

/** A file name for a theme called `name`: characters Windows doesn't allow in names are left out. */
export function themeFileName(name: string): string {
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/[. ]+$/, "").trim();
  return (safe || "My colors") + THEME_EXTENSION;
}

/** The name a theme file goes by when its own is missing: its file name without the extension. */
const nameOfFile = (fileName: string) => fileName.replace(/(\.octavo-theme)?\.json$/i, "") || fileName;

const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined);

/**
 * The theme in `text`, read from a file called `fileName`, or why it can't be imported. Only known colors with valid
 * values are kept; the rest of the file is ignored.
 */
export function parseTheme(text: string, fileName: string): Theme | ThemeError {
  if (new TextEncoder().encode(text).length > MAX_THEME_BYTES) return { ...NOT_A_THEME, detail: "It's larger than 64 KB." };
  let data: Record<string, unknown> | undefined;
  try {
    // A byte order mark is allowed before the JSON.
    data = record(JSON.parse(text.replace(/^﻿/, "")));
  } catch {
    return NOT_A_THEME;
  }
  const version = data?.octavoTheme;
  if (typeof version === "number" && Number.isInteger(version) && version > THEME_VERSION) return NEWER_THEME;
  if (!data || version !== THEME_VERSION) return NOT_A_THEME;
  const named = typeof data.name === "string" ? Array.from(data.name.trim()).slice(0, MAX_NAME).join("").trim() : "";
  return { name: named || nameOfFile(fileName), colors: sanitizeColors(data) };
}

export const isThemeError = (result: Theme | ThemeError): result is ThemeError => "lead" in result;

/** What an import brought: "3 base colors, 24 light, 22 dark". */
export function themeCounts(colors: Colors): string {
  const base = Object.keys(colors.base).length;
  return `${base} base ${base === 1 ? "color" : "colors"}, ${Object.keys(colors.light).length} light, ${Object.keys(colors.dark).length} dark`;
}
