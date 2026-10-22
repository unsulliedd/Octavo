import { useEffect, useRef } from "react";
import type { SourceEditor } from "./sourceEditor";

type Props = {
  /** The Markdown the view opens with. */
  markdown: string;
  /** The editor has loaded; its session answers for its edits. */
  onReady: (editor: SourceEditor) => void;
  onChange: () => void;
  /** The view closes; its edits are still in the session. */
  onLeave: (editor: SourceEditor) => void;
};

/** Source mode: the document's Markdown in a text editor, edited as it is. The editor loads on first use. */
export function SourcePane({ markdown, onReady, onChange, onLeave }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onChange, onLeave });
  callbacks.current = { onReady, onChange, onLeave };

  useEffect(() => {
    let editor: SourceEditor | undefined;
    let closed = false;
    void import("./sourceEditor").then(({ createSourceEditor }) => {
      if (closed || !host.current) return;
      editor = createSourceEditor(host.current, markdown, () => callbacks.current.onChange());
      callbacks.current.onReady(editor);
    });
    return () => {
      closed = true;
      if (!editor) return;
      callbacks.current.onLeave(editor);
      editor.destroy();
    };
  }, []);

  return <div ref={host} className="source-input" />;
}
