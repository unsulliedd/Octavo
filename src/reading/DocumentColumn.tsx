import type { ComponentProps, MouseEvent, ReactNode, RefObject } from "react";
import { EditorPane } from "@/editor/EditorPane";
import type { EditorLayout } from "@/editor/layout";
import type { Doc } from "@/files/useDocuments";
import type { Draft } from "@/files/useEditState";
import { basename, folderTrail } from "@/lib/paths";
import type { Prefs } from "@/settings/storage";
import { SourcePane } from "@/source/SourcePane";

type EditorProps = ComponentProps<typeof EditorPane>;

type Props = {
  doc: Doc;
  draft: Draft | undefined;
  dark: boolean;
  /** Which view shows: the source, the reading view until the editor has loaded, the editor. */
  source: boolean;
  editing: boolean;
  editorReady: boolean;
  /** The key of the editor pane; the Source view's adds ":source". */
  editorKey: string;
  shownHtml: string | undefined;
  prefs: Prefs;
  article: RefObject<HTMLElement | null>;
  onDocClick: (e: MouseEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  sourcePane: () => ComponentProps<typeof SourcePane>;
  editorPane: () => Omit<EditorProps, "formatSlot" | "formatAlign" | "layout" | "tableSide" | "status" | "onOpenLink">;
  formatSlot: HTMLElement | null;
  layout: EditorLayout;
  saveStatus: ReactNode;
  onOpenLink: (href: string) => void;
};

/** The shown document under its folder trail: in the Source view, the reading view or the editor. */
export function DocumentColumn(p: Props) {
  const { doc, draft, dark, source, editing, editorReady, editorKey, shownHtml, prefs } = p;
  return (
    <div className="doc-column">
      <div className="breadcrumb" data-tip={doc.path}>
        {folderTrail(doc.path)} › {basename(doc.path)}
      </div>
      {source && <SourcePane key={`${editorKey}:source`} {...p.sourcePane()} />}
      {!editorReady && !source && shownHtml !== undefined && (
        <article
          key={`${doc.path}:${dark}:${draft ? "draft" : "file"}`}
          className="doc"
          data-click-large={prefs.openLarge !== "button" || undefined}
          ref={p.article}
          onClick={p.onDocClick}
          onContextMenu={p.onContextMenu}
          dangerouslySetInnerHTML={{ __html: shownHtml }}
        />
      )}
      {editing && (
        <EditorPane
          key={editorKey}
          {...p.editorPane()}
          formatSlot={p.formatSlot}
          formatAlign={prefs.formatBarAlign}
          layout={p.layout}
          tableSide={prefs.tableBar === "side"}
          status={p.saveStatus}
          onOpenLink={p.onOpenLink}
        />
      )}
    </div>
  );
}
