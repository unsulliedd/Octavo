// Source mode's edits: the document's Markdown as typed, saved as it is. It answers the same questions about
// unsaved edits as the editor's session, so saving, autosave and closing treat both alike.

export type SourceSnapshot = { markdown: string; exact: true; source: true };

export type SourceSession = {
  /** True when the text differs from what was loaded or last saved. */
  edited(): boolean;
  snapshot(base?: string): SourceSnapshot;
  markSaved(snapshot: { markdown: string }): void;
};

/** The session of a Source view that loaded `initial` and reads its current text from `text`. */
export function sourceSession(initial: string, text: () => string): SourceSession {
  let saved = initial;
  return {
    edited: () => text() !== saved,
    snapshot: () => ({ markdown: text(), exact: true, source: true }),
    markSaved: (snapshot) => void (saved = snapshot.markdown),
  };
}
