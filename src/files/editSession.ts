// An edit session lasts from Edit to Done: it keeps the file's text as it was when editing started, so
// Revert to original can bring it back after any number of saves.

type Session = {
  /** The file's text when the session started; undefined outside a session. */
  original: string | undefined;
  /** The file's text as last read or written. */
  onDisk: string;
  /** Whether there are edits not written to the file. */
  unsaved: boolean;
};

/** Revert has something to undo: edits not yet written, or a file that no longer holds the original. */
export const canRevert = ({ original, onDisk, unsaved }: Session) => original !== undefined && (unsaved || onDisk !== original);

/** The text Revert writes back, or undefined when the file still holds the original. */
export const revertText = ({ original, onDisk }: Session) => (original !== undefined && onDisk !== original ? original : undefined);
