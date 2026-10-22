import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { fenceLanguage, languageName, matchLanguages } from "../languages";

type Props = {
  /** As written after the opening fence; empty for plain text. */
  language: string;
  /** The code block's top right corner in the editor pane; the button sits just above it. */
  top: number;
  right: number;
  onPick: (language: string) => void;
  /** Returns the focus to the editor when the list closes without a pick. */
  onCancel: () => void;
};

/**
 * The language of the code block at the cursor, as a button that opens a searchable list. Enter picks the
 * highlighted language, or what was typed when nothing matches.
 */
export function CodeLanguage({ language, top, right, onPick, onCancel }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement>(null);
  const matches = matchLanguages(query);
  const typed = fenceLanguage(query);
  // A typed name that isn't offered can be written as it is.
  const custom = typed && !matches.some((id) => id === typed.toLowerCase()) ? typed : undefined;
  const choices = [...(custom ? [custom] : []), ...matches];
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  useEffect(() => setActive(0), [query]);

  function pick(id: string) {
    setOpen(false);
    setQuery("");
    onPick(id);
  }
  function close() {
    setOpen(false);
    setQuery("");
    onCancel();
  }

  // The button keeps the editor's selection; only the search field takes the focus.
  return (
    <div className="code-lang-anchor" style={{ top, left: right }} onMouseDown={(e) => !(e.target instanceof HTMLInputElement) && e.preventDefault()}>
      <button className="code-lang-button" aria-haspopup="listbox" aria-expanded={open} title="Code block language" onClick={() => (open ? close() : setOpen(true))}>
        {language ? languageName(language) : "Plain text"}
        <Icon name="down" size={12} />
      </button>
      {open && (
        <div className="code-lang-menu">
          <input
            ref={field}
            placeholder="Search or type a language"
            aria-label="Code block language"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") setActive((i) => Math.min(i + 1, choices.length - 1));
              else if (e.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0));
              else if (e.key === "Enter" && choices[active] !== undefined) pick(choices[active]);
              else return;
              e.preventDefault();
            }}
          />
          <div className="code-lang-list" role="listbox" aria-label="Languages">
            {!query && (
              <button role="option" aria-selected={language === ""} onClick={() => pick("")}>
                Plain text
              </button>
            )}
            {choices.map((id, i) => (
              <button key={id} role="option" aria-selected={id === language} data-active={i === active || undefined} onClick={() => pick(id)}>
                {id === custom ? `Use “${id}”` : languageName(id)}
                <span className="code-lang-id">{id}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
