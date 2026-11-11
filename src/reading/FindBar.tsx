import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { comboOf } from "@/app/shortcuts";
import type { FindOptions, FindTarget } from "./find";
import { useFind } from "./useFind";
import { Icon } from "@/ui/icons";

/** What the find bar holds for the session: the search, its options, the replacement and whether Replace shows. */
export type FindState = { open: boolean; query: string; options: FindOptions; replace: string; replaceOpen: boolean; focusKey: number };

type Props = {
  find: FindState;
  onChange: (change: Partial<FindState>) => void;
  /** The editor's or the Source view's target; without one the bar searches the reading view and only finds. */
  target: FindTarget | undefined;
  /** The rendered document to search. */
  root: RefObject<HTMLElement | null>;
  /** The scrolling reading area, to bring the current match into view. */
  scroller: RefObject<HTMLElement | null>;
  /** Changes whenever the document's DOM is replaced, so matches are found again. */
  content: unknown;
  onClose: () => void;
};

/** The options, their keys while the bar has the focus, and what each button shows. */
const OPTIONS: { key: keyof FindOptions; label: string; keys: string; glyph: string }[] = [
  { key: "matchCase", label: "Match case", keys: "Alt+C", glyph: "Aa" },
  { key: "wholeWord", label: "Whole word", keys: "Alt+W", glyph: "ab" },
  { key: "regex", label: "Regular expression", keys: "Alt+R", glyph: ".*" },
];

/** The find bar: Find with its options everywhere, and Replace while editing. */
export function FindBar({ find, onChange, target, root, scroller, content, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const { options, query } = find;
  const { count, error, label, step, canReplace, replaceOne, replaceAll } = useFind({ target, root, scroller, content, query, options });
  const replaceShown = canReplace && find.replaceOpen;

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [find.focusKey]);

  // Escape and F3 work while the focus is in the document too.
  const keys = useRef({ step, onClose });
  keys.current = { step, onClose };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") keys.current.onClose();
      else if (e.key === "F3") {
        e.preventDefault();
        keys.current.step(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onBarKey(e: ReactKeyboardEvent) {
    const option = OPTIONS.find((o) => o.keys === comboOf(e));
    if (!option) return;
    e.preventDefault();
    onChange({ options: { ...options, [option.key]: !options[option.key] } });
  }

  return (
    <div className="find" role="search" onKeyDown={onBarKey}>
      {canReplace && (
        <button className="icon-btn find-expand" aria-label="Replace" aria-expanded={replaceShown} onClick={() => onChange({ replaceOpen: !find.replaceOpen })}>
          <Icon name="down" />
        </button>
      )}
      <div className="find-rows">
        <div className="find-row">
          <Icon name="search" />
          <label htmlFor="find-input" className="visually-hidden">
            Find in document
          </label>
          <input
            id="find-input"
            ref={input}
            value={query}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!error}
            onChange={(e) => onChange({ query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              }
            }}
          />
          {OPTIONS.map((o) => (
            <button key={o.key} className="icon-btn find-option" data-option={o.key} aria-label={`${o.label} (${o.keys})`} aria-pressed={options[o.key]} onClick={() => onChange({ options: { ...options, [o.key]: !options[o.key] } })}>
              <span aria-hidden="true">{o.glyph}</span>
            </button>
          ))}
          <span className={error ? "find-count find-error" : "find-count"} aria-live="polite">
            {label}
          </span>
          <button className="icon-btn" aria-label="Previous match (Shift+Enter)" disabled={!count} onClick={() => step(-1)}>
            <Icon name="up" />
          </button>
          <button className="icon-btn" aria-label="Next match (Enter)" disabled={!count} onClick={() => step(1)}>
            <Icon name="down" />
          </button>
          <button className="icon-btn" aria-label="Close find (Escape)" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {replaceShown && (
          <div className="find-row">
            <span className="find-gap" aria-hidden="true" />
            <label htmlFor="replace-input" className="visually-hidden">
              Replace with
            </label>
            <input
              id="replace-input"
              value={find.replace}
              placeholder="Replace with"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => onChange({ replace: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  replaceOne(find.replace);
                }
              }}
            />
            <button className="text-btn" disabled={!count} onClick={() => replaceOne(find.replace)}>
              Replace
            </button>
            <button className="text-btn" disabled={!count} onClick={() => replaceAll(find.replace)}>
              Replace all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
