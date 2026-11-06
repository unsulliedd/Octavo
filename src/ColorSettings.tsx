import { useRef, useState } from "react";
import { BASES, DEFAULT_BASES, parseHex, withBase, type Base, type Colors } from "./colors";
import { Icon } from "./icons";
import { ThemeSetting } from "./ReadingSettings";
import type { Theme } from "./storage";
import { described } from "./tooltip";

type Props = { theme: Theme; onTheme: (theme: Theme) => void; colors: Colors; onChange: (colors: Colors) => void };

const BASE_TEXT: Record<Base, { label: string; help: string }> = {
  primary: { label: "Primary", help: "Buttons, checkboxes, selected rows, document icons and headings in Source mode." },
  secondary: { label: "Secondary", help: "Links, the focus ring, selected text and drop targets." },
  accent: { label: "Accent", help: "Pins, folder icons, find matches, inline code and notices." },
};

/** The theme, the three base colors with a picker, a hex field and Reset each, and a preview that follows them. */
export function ColorSettings({ theme, onTheme, colors, onChange }: Props) {
  return (
    <div className="settings-section">
      <ThemeSetting value={theme} onPick={onTheme} />
      <section className="shortcut-group" aria-labelledby="base-colors">
        <div>
          <h3 id="base-colors" className="setting-label">
            Base colors
          </h3>
          <span className="setting-hint">Used in both themes. Octavo lightens or darkens them where text sits on them, so it stays readable.</span>
        </div>
        <ul className="shortcut-list">
          {BASES.map((key) => (
            <ColorRow key={key} base={key} value={colors.base[key] ?? DEFAULT_BASES[key]} onPick={(hex) => onChange(withBase(colors, key, hex))} />
          ))}
        </ul>
      </section>
      <section className="shortcut-group" aria-labelledby="color-preview">
        <h3 id="color-preview" className="setting-label">
          Preview
        </h3>
        <ColorPreview />
      </section>
    </div>
  );
}

/** One base color. A typed value is checked when the field is left or Enter is pressed; a bad one changes nothing. */
function ColorRow({ base, value, onPick }: { base: Base; value: string; onPick: (hex: string | undefined) => void }) {
  const { label, help } = BASE_TEXT[base];
  const [draft, setDraft] = useState<string>();
  const [bad, setBad] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const id = `color-${base}`;
  const pick = (hex: string | undefined) => {
    setDraft(undefined);
    setBad(false);
    onPick(hex);
  };
  const commit = () => {
    if (draft === undefined) return;
    const hex = parseHex(draft);
    if (hex) pick(hex);
    else setBad(true);
  };
  return (
    <li className="shortcut-row color-row">
      <span className="shortcut-label">
        <label htmlFor={id}>{label}</label>
        <span className="setting-hint" id={`${id}-help`}>
          {help}
        </span>
      </span>
      <span className="color-pick">
        <button className="color-swatch" aria-label={`Choose ${label} color`} {...described(value)} onClick={() => picker.current?.click()}>
          <span style={{ background: value }} />
        </button>
        {/* The system color picker opens from here, under the swatch; each color chosen in it applies at once. */}
        <input ref={picker} type="color" tabIndex={-1} aria-hidden="true" value={value} onChange={(e) => pick(e.target.value)} />
      </span>
      <input
        id={id}
        className="color-hex"
        value={draft ?? value}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-error ${id}-help` : `${id}-help`}
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <button
        className="icon-btn"
        aria-label={`Reset ${label}`}
        {...described(`Reset to ${DEFAULT_BASES[base]}`)}
        hidden={value === DEFAULT_BASES[base]}
        onClick={() => pick(undefined)}
      >
        <Icon name="revert" />
      </button>
      {bad && (
        <span className="color-error" id={`${id}-error`}>
          <Icon name="warning" size="inline" />
          Enter # and six hex digits, such as #d39d3f. {label} stays as it was.
        </span>
      )}
    </li>
  );
}

/** A small sidebar and document drawn with the app's own classes, so they show the colors as they are. */
function ColorPreview() {
  return (
    <div className="color-preview" inert aria-hidden="true">
      <div className="tree color-preview-side">
        <div className="tree-row" data-folder>
          <Icon name="down" size="inline" />
          <Icon name="folder" size="row" />
          <span className="tree-name">Notes</span>
        </div>
        <div className="tree-children" style={{ "--guide": "14px" } as React.CSSProperties}>
          <div className="tree-row" aria-current="page">
            <span className="tree-slot" />
            <Icon name="markdown" size="row" />
            <span className="tree-name">showcase.md</span>
          </div>
          <div className="tree-row">
            <span className="tree-slot" />
            <Icon name="markdown" size="row" />
            <span className="tree-name">roadmap.md</span>
            <span className="color-preview-pin">
              <Icon name="pin" size="inline" />
            </span>
          </div>
        </div>
      </div>
      <div className="doc color-preview-doc">
        <p>
          Read the <a>reading guide</a>, then <span className="color-preview-select">select a line</span> to edit it. Find shows{" "}
          <span className="color-preview-match">edit</span> and <span className="color-preview-match current">edit</span>.
        </p>
        <ul>
          <li>
            <input type="checkbox" checked readOnly />A task that is done
          </li>
        </ul>
        <div className="color-preview-buttons">
          <button className="text-btn primary">Done</button>
          <button className="text-btn">Cancel</button>
        </div>
      </div>
    </div>
  );
}
