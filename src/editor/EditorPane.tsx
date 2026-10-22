import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Floating, FloatingBar, LinkChip, LinkField } from "./Floating";
import { FormatBar, type DocActions } from "./FormatBar";
import type { FormatAction, FormatState } from "./formatInfo";
import type { EditorLayout } from "./layout";
import type { EditorSession } from "./session";
import type { TableInfo } from "./tableInfo";
import { TableBar } from "./TableBar";
import { CodeLanguage } from "./CodeLanguage";
import { MathEditor } from "./MathEditor";
import { ImageEditor } from "./ImageEditor";
import { MermaidEditor } from "./MermaidEditor";
import { isDark } from "../mermaid";
import { editorShortcut } from "../shortcuts";
import { useKeys } from "../useKeys";

type Props = {
  /** Markdown to edit, as in the file or a draft. */
  markdown: string;
  imageUrl: (src: string) => string;
  /**
   * Checks the Markdown the editor writes for the loaded document before editing is allowed;
   * resolves to an error message when the document can't be edited safely.
   */
  verify?: (markdown: string) => Promise<string | undefined>;
  /** Called when the pane mounts, with the same `markdown` the editor loads. */
  onStart: () => void;
  onReady: (session: EditorSession, root: HTMLElement) => void;
  /** Where the formatting bar goes: a row under the toolbar. */
  formatSlot: HTMLElement | null;
  formatAlign: "left" | "center";
  layout: EditorLayout;
  tableSide: boolean;
  docActions: DocActions;
  /** The save status, for the formatting bar row when the layout puts it there. */
  status: ReactNode;
  onOpenLink: (href: string) => void;
  /** Asks for an image file; resolves to its address as written in the document, and its alt text. */
  onPickImage: () => Promise<{ src: string; alt: string } | undefined>;
  /** Saves pasted image files next to the document; resolves to their addresses and alt texts. */
  onPasteImages: (files: File[]) => Promise<{ src: string; alt: string }[]>;
  onBlocked: (message: string) => void;
  onChange: () => void;
  /** Called while the pane unmounts, before the editor is destroyed. */
  onLeave: (session: EditorSession) => void;
};

type Point = { left: number; top: number; bottom: number };

/** The document in the Milkdown editor. The editor code loads on first use. */
export function EditorPane(props: Props) {
  const { markdown, imageUrl, verify, onStart, onReady, formatSlot, formatAlign, layout, tableSide, docActions, status, onOpenLink, onPickImage, onPasteImages, onBlocked, onChange, onLeave } =
    props;
  const root = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  // The table the cursor is in, and where it is in the pane.
  const [table, setTable] = useState<{ info: TableInfo; box: { top: number; left: number; height: number } }>();
  // The code block the cursor is in: its language, and where its top right corner is in the pane.
  const [code, setCode] = useState<{ language: string; top: number; right: number }>();
  // The selected formula: its source, whether it is a block, and where its bottom left corner is in the pane.
  const [math, setMath] = useState<{ value: string; block: boolean; left: number; top: number }>();
  // The selected image: its source, alt text and title, and where its bottom left corner is in the pane.
  const [image, setImage] = useState<{ src: string; alt: string; title: string; left: number; top: number }>();
  // The selected Mermaid diagram's source; its dialog is open while it is selected.
  const [diagram, setDiagram] = useState<{ value: string }>();
  // Where the selection starts and ends in the pane.
  const [selection, setSelection] = useState<{ start: Point; end: Point; empty: boolean }>();
  const current = useRef<EditorSession>(undefined);
  const pane = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<FormatState>({ active: [], disabled: ["undo", "redo"] });
  // The link field is open (the Link shortcut or a link button).
  const [linking, setLinking] = useState(false);
  const bindings = useKeys();
  // The listener runs before the view has the new state, so the table, formats and selection are read once it does.
  const updateTable = () =>
    setTimeout(() => {
      const s = current.current;
      const base = pane.current?.getBoundingClientRect();
      if (!s || !base) return;
      setFormat(s.format());
      const found = s.table();
      const rect = found?.element.getBoundingClientRect();
      setTable(found && rect && { info: found.info, box: { top: rect.top - base.top, left: rect.left - base.left, height: rect.height } });
      const block = s.codeBlock();
      const blockRect = block?.element.getBoundingClientRect();
      setCode(block && blockRect && { language: block.language, top: blockRect.top - base.top, right: blockRect.right - base.left });
      const formula = s.math();
      const mathRect = formula?.element.getBoundingClientRect();
      setMath(formula && mathRect && { value: formula.value, block: formula.block, left: mathRect.left - base.left, top: mathRect.bottom - base.top });
      const img = s.image();
      const imgRect = img?.element.getBoundingClientRect();
      setImage(img && imgRect && { src: img.src, alt: img.alt, title: img.title, left: imgRect.left - base.left, top: imgRect.bottom - base.top });
      setDiagram(s.diagram());
      const sel = s.selection();
      const at = (p: Point) => ({ left: p.left - base.left, top: p.top - base.top, bottom: p.bottom - base.top });
      setSelection({ start: at(sel.start), end: at(sel.end), empty: sel.empty });
    });
  // The formatting shortcuts set in Settings. An action that can't run where the cursor is leaves the key to the
  // editor; Shift+Enter keeps working in code blocks, where Line break has no button.
  const onKey = (event: KeyboardEvent) => {
    const a = editorShortcut(event, bindings);
    if (!a || (a !== "lineBreak" && current.current?.format().disabled.includes(a))) return false;
    if (a === "link") setLinking(true);
    else action(a);
    return true;
  };
  // Pasted image files are saved next to the document and inserted at the cursor, in order.
  const onPaste = (files: File[]) => {
    void onPasteImages(files).then((images) => images.forEach((i) => current.current?.insertImage(i.src, i.alt)));
    return true;
  };
  const callbacks = useRef({ onReady, onBlocked, onChange, onLeave, verify, imageUrl, onKey, onPaste });
  callbacks.current = { onReady, onBlocked, onChange, onLeave, verify, imageUrl, onKey, onPaste };

  useEffect(() => {
    onStart();
    let session: EditorSession | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { createEditor } = await import("./session");
        if (cancelled || !root.current) return;
        session = await createEditor(root.current, markdown, {
          imageUrl: (src) => callbacks.current.imageUrl(src),
          onChange: () => {
            callbacks.current.onChange();
            updateTable();
          },
          onSelection: updateTable,
          onKey: (event) => callbacks.current.onKey(event),
          onPasteImages: (files) => callbacks.current.onPaste(files),
        });
        if (cancelled) return void session.destroy();
        const problem = await callbacks.current.verify?.(session.markdown());
        if (cancelled) return;
        if (problem) {
          const s = session;
          session = undefined;
          await s.destroy();
          callbacks.current.onBlocked(problem);
          return;
        }
        current.current = session;
        setShown(true);
        setFormat(session.format());
        callbacks.current.onReady(session, root.current);
      } catch (e) {
        if (!cancelled) callbacks.current.onBlocked(`The editor couldn't start: ${e}`);
      }
    })();
    return () => {
      cancelled = true;
      current.current = undefined;
      if (session) {
        callbacks.current.onLeave(session);
        session.destroy();
      }
    };
    // The editor is created once per mount; a different document mounts a new pane (keyed by the caller).
  }, []);

  // The editor takes the focus once it is visible.
  useEffect(() => {
    if (shown) current.current?.focus();
  }, [shown]);

  const action = (a: FormatAction) => {
    if (a !== "image") return current.current?.formatAction(a);
    void onPickImage().then((image) => (image ? current.current?.insertImage(image.src, image.alt) : current.current?.focus()));
  };
  // A new address links the selection (or replaces the link at the cursor); otherwise the editor gets the focus back.
  function finishLink(href?: string) {
    setLinking(false);
    if (href && href !== format.href) current.current?.setLink(href);
    else current.current?.focus();
  }
  const field = <LinkField initial={format.href ?? ""} onDone={finishLink} onClose={() => setLinking(false)} />;
  const chip = format.href && (
    <LinkChip
      href={format.href}
      onEdit={() => setLinking(true)}
      onOpen={() => onOpenLink(format.href!)}
      onRemove={() => current.current?.setLink(null)}
    />
  );

  // Until the editor has loaded, the pane takes no space, so the reading view stays in place above it.
  return (
    <div
      className="editor-pane"
      ref={pane}
      data-shown={shown || undefined}
    >
      {shown &&
        formatSlot &&
        layout.barRow &&
        createPortal(
          <FormatBar
            state={format}
            onAction={action}
            onLink={() => setLinking(true)}
            align={formatAlign}
            link={linking && !layout.linkPopover ? field : layout.linkInBar && chip}
            status={layout.status === "bar" && status}
            doc={layout.actionsInBar ? docActions : undefined}
          />,
          formatSlot,
        )}
      <div className="doc editor" ref={root} data-shown={shown || undefined} />
      {table && <TableBar table={table.info} box={table.box} side={tableSide} onAction={(a) => current.current?.tableAction(a)} />}
      {shown && code && (
        <CodeLanguage
          key={`${code.top}:${code.language}`}
          language={code.language}
          top={code.top}
          right={code.right}
          onPick={(language) => current.current?.setCodeLanguage(language)}
          onCancel={() => current.current?.focus()}
        />
      )}
      {shown && math && (
        <MathEditor
          key={`${math.left}:${math.top}`}
          value={math.value}
          block={math.block}
          left={math.left}
          top={math.top}
          render={(value) => current.current?.renderMath(value, math.block) ?? ""}
          onDone={(value) => current.current?.setMath(value)}
        />
      )}
      {shown && diagram && (
        <MermaidEditor
          value={diagram.value}
          dark={!!pane.current && isDark(pane.current)}
          onDone={(value) => current.current?.setDiagram(value)}
          onCancel={() => current.current?.setDiagram(diagram.value)}
          onCode={() => current.current?.diagramToCode()}
        />
      )}
      {shown && image && (
        <ImageEditor
          key={`${image.left}:${image.top}:${image.src}`}
          src={image.src}
          alt={image.alt}
          title={image.title}
          left={image.left}
          top={image.top}
          onDone={(alt, title) => current.current?.setImage(alt, title)}
        />
      )}
      {shown && selection && layout.floating && !selection.empty && !linking && !math && !image && (
        <Floating label="Formatting" left={Math.max(0, selection.start.left - 8)} top={selection.start.top - 44}>
          <FloatingBar state={format} onAction={action} onLink={() => setLinking(true)} />
        </Floating>
      )}
      {shown && selection && layout.linkPopover && (linking || format.href) && (
        <Floating label="Link" left={Math.max(0, selection.end.left - 12)} top={selection.end.bottom + 6}>
          {linking ? field : chip}
        </Floating>
      )}
    </div>
  );
}
