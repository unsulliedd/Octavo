// Code block languages: their display names, and the list the editor offers. Shared by the reader and the editor.

/** Display names by the name written after the opening fence, aliases included. */
export const LANGUAGE_NAMES: Record<string, string> = {
  arduino: "Arduino", bash: "Bash", c: "C", cpp: "C++", cs: "C#", csharp: "C#", css: "CSS", diff: "Diff", go: "Go",
  graphql: "GraphQL", html: "HTML", ini: "INI", java: "Java", javascript: "JavaScript", js: "JavaScript", json: "JSON",
  jsx: "JSX", kotlin: "Kotlin", less: "Less", lua: "Lua", makefile: "Makefile", markdown: "Markdown", md: "Markdown",
  mermaid: "Mermaid diagram", objectivec: "Objective-C", perl: "Perl", php: "PHP", plaintext: "Text",
  powershell: "PowerShell", ps1: "PowerShell", py: "Python", python: "Python", r: "R", rb: "Ruby", ruby: "Ruby",
  rs: "Rust", rust: "Rust", scss: "SCSS", sh: "Shell", shell: "Shell", sql: "SQL", swift: "Swift", text: "Text",
  toml: "TOML", ts: "TypeScript", tsx: "TSX", txt: "Text", typescript: "TypeScript", vbnet: "VB.NET", wasm: "WebAssembly",
  xml: "XML", yaml: "YAML", yml: "YAML",
};

/** The languages the editor offers, by the name it writes: one entry per language, no aliases. */
export const LANGUAGES = [
  "mermaid", "bash", "c", "cpp", "csharp", "css", "diff", "go", "graphql", "html", "ini", "java", "javascript", "json",
  "jsx", "kotlin", "less", "lua", "makefile", "markdown", "objectivec", "perl", "php", "powershell", "python", "r",
  "ruby", "rust", "scss", "shell", "sql", "swift", "toml", "tsx", "typescript", "vbnet", "xml", "yaml",
];

export const languageName = (id: string) => LANGUAGE_NAMES[id.toLowerCase()] ?? id;

/**
 * The offered languages matching `query` by name or by what is written, those starting with it first. An empty
 * query matches all of them.
 */
export function matchLanguages(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return LANGUAGES;
  const hits = LANGUAGES.filter((id) => id.includes(q) || languageName(id).toLowerCase().includes(q));
  const starts = (id: string) => id.startsWith(q) || languageName(id).toLowerCase().startsWith(q);
  return [...hits.filter(starts), ...hits.filter((id) => !starts(id))];
}

/** What to write after the opening fence for a typed language: its first word, or nothing. */
export const fenceLanguage = (typed: string) => typed.trim().split(/\s+/)[0] ?? "";
