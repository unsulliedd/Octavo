// Frontmatter as name and value rows, for the properties panel. Only YAML where every line is `name: value`
// becomes rows; anything deeper (nested maps, block lists, multi-line strings, comments) is edited as YAML.
// Values are YAML as written: `[a, b]` is a list, `"x"` a quoted string.

export type Property = { key: string; value: string };

const LINE = /^([A-Za-z0-9_][\w .-]*?):(?:[ \t]+(.*?))?[ \t]*$/;

/** The rows of `yaml`, or undefined when it isn't only `name: value` lines. Blank lines are skipped. */
export function parseProperties(yaml: string): Property[] | undefined {
  const rows: Property[] = [];
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = LINE.exec(line);
    // A value starting with | or > continues on the next lines; # starts a comment.
    if (!m || /^[|>#]/.test(m[2] ?? "")) return undefined;
    rows.push({ key: m[1], value: m[2] ?? "" });
  }
  return rows;
}

/** A value that would read as more than one name and value is written in double quotes. */
function yamlValue(value: string) {
  const v = value.trim();
  if (!/: | #/.test(v) || /^["'[{]/.test(v)) return v;
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The YAML for `rows`; rows without a name are left out. */
export function serializeProperties(rows: Property[]) {
  return rows
    .filter((r) => r.key.trim())
    .map((r) => {
      const value = yamlValue(r.value);
      return value ? `${r.key.trim()}: ${value}` : `${r.key.trim()}:`;
    })
    .join("\n");
}

const unquote = (s: string) => {
  const t = s.trim();
  return /^(["']).*\1$/.test(t) ? t.slice(1, -1).replace(/\\(["\\])/g, "$1") : t;
};

/** A value as the reading view shows it: a list `[a, b]` as its items, a quoted string without its quotes. */
export function displayValue(value: string): string | string[] {
  const list = /^\[(.*)\]$/.exec(value.trim());
  // Limitation: splits on every comma, so a quoted item holding a comma shows as two; parse YAML if that matters
  return list ? list[1].split(",").map(unquote).filter(Boolean) : unquote(value);
}

/** A property name can't hold the characters that end a name or start a comment. */
export const cleanKey = (key: string) => key.replace(/[:#\n]/g, "");
