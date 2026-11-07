import type { ReactNode } from "react";
import type { Workspaces } from "@/workspaces/useWorkspaces";
import { WorkspaceStatus } from "@/workspaces/FilesPanel";

type Props = {
  workspaces: Workspaces;
  /** With a document shown: its word count, line endings and save status. */
  document: { words: number; lineEndings: string; saveStatus: ReactNode | false } | undefined;
  version: string;
};

/** The bar at the bottom of the window. */
export function StatusBar({ workspaces, document, version }: Props) {
  return (
    <footer className="statusbar">
      {document ? (
        <>
          <span className="status-left">
            <WorkspaceStatus ws={workspaces} />
            <span>
              {document.words.toLocaleString()} words · {Math.max(1, Math.round(document.words / 230))} min read
            </span>
          </span>
          <span className="status-right">
            {document.saveStatus}
            <span>UTF-8</span>
            <span>{document.lineEndings}</span>
            <span>Markdown</span>
          </span>
        </>
      ) : (
        <>
          <span className="status-left">
            <WorkspaceStatus ws={workspaces} />
            <span>Octavo {version}</span>
          </span>
          <span>No document open</span>
        </>
      )}
    </footer>
  );
}
