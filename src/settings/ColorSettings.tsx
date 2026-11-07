import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  applyColors,
  BASES,
  DEFAULT_BASES,
  GROUPS,
  parseHex,
  readColor,
  ROLES,
  roleResetTip,
  roleTag,
  withBase,
  withoutGroup,
  withRole,
  type Base,
  type ColorSet,
  type Colors,
} from "./colors";
import { contrastWarnings } from "./contrast";
import { Icon } from "@/ui/icons";
import { ThemeSetting } from "./ReadingSettings";
import type { Theme } from "./storage";
import { TabMenu } from "@/ui/TabMenu";
import { described } from "@/ui/tooltip";

type Props = {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  /** Whether the dark theme shows now. */
  dark: boolean;
  colors: Colors;
  onChange: (colors: Colors) => void;
};

const BASE_TEXT: Record<Base, { label: string; help: string }> = {
  primary: { label: "Primary", help: "Buttons, checkboxes, selected rows, document icons and headings in Source mode." },
  secondary: { label: "Secondary", help: "Links, the focus ring, selected text and drop targets." },
  accent: { label: "Accent", help: "Pins, folder icons, find matches, inline code and notices." },
};

const SET_LABEL: Record<ColorSet, string> = { light: "Light", dark: "Dark" };

/**
 * The theme, the three base colors, and every color role of the light or the dark set, picked with Colors for, in
 * groups. Each color has a picker, a hex field and Reset. The preview and the code samples draw the set being edited.
 */
export function ColorSettings({ theme, onTheme, dark, colors, onChange }: Props) {
  const [set, setSet] = useState<ColorSet>(dark ? "dark" : "light");
  useEffect(() => setSet(dark ? "dark" : "light"), [dark]);
  const [jump, setJump] = useState<{ x: number; y: number }>();
  const host = useRef<HTMLDivElement>(null);
  // Every role's color in the set being edited, read from the samples, which carry that set's colors.
  const [values, setValues] = useState<Record<string, string | undefined>>({});

  useLayoutEffect(() => {
    const scopes = host.current?.querySelectorAll<HTMLElement>(".color-scope") ?? [];
    for (const scope of scopes) applyColors(scope.style, colors, set === "dark");
    const read: Record<string, string | undefined> = {};
    for (const probe of host.current?.querySelectorAll<HTMLElement>("[data-role]") ?? []) read[probe.dataset.role!] = readColor(probe);
    setValues(read);
  }, [colors, set]);

  const changed = colors[set];
  const warnings = contrastWarnings(values, changed);

  return (
    <div className="settings-section" ref={host}>
      <ThemeSetting value={theme} onPick={onTheme} />
      <section className="shortcut-group" aria-labelledby="base-colors">
        <div>
          <h3 id="base-colors" className="setting-label">
            Base colors
          </h3>
          <span className="setting-hint">Used in both themes. Octavo lightens or darkens them where text sits on them, so it stays readable.</span>
        </div>
        <ul className="shortcut-list">
          {BASES.map((key) => {
            const value = colors.base[key] ?? DEFAULT_BASES[key];
            return (
              <ColorRow
                key={key}
                id={`color-${key}`}
                label={BASE_TEXT[key].label}
                help={BASE_TEXT[key].help}
                value={value}
                changed={value !== DEFAULT_BASES[key]}
                resetTip={`Reset to ${DEFAULT_BASES[key]}`}
                onPick={(hex) => onChange(withBase(colors, key, hex))}
              />
            );
          })}
        </ul>
      </section>
      <div className="color-band">
        <div className="color-band-bar">
          <span className="setting-label" id="color-set">
            Colors for
          </span>
          <div className="seg color-set" role="radiogroup" aria-labelledby="color-set" aria-describedby="color-set-hint">
            {(["light", "dark"] as const).map((value) => (
              <label key={value}>
                <input type="radio" name="color-set" value={value} checked={set === value} onChange={() => setSet(value)} />
                {SET_LABEL[value]}
              </label>
            ))}
          </div>
          <span className="setting-hint" id="color-set-hint">
            {SET_LABEL[set === "dark" ? "light" : "dark"]} keeps its own colors.
          </span>
          <button
            className="text-btn small with-icon"
            data-menu-toggle
            aria-haspopup="menu"
            aria-expanded={!!jump}
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              setJump((open) => (open ? undefined : { x: box.right - 250, y: box.bottom + 4 }));
            }}
          >
            Jump to
            <Icon name="down" size="inline" />
          </button>
          {jump && (
            <TabMenu
              name="Jump to"
              x={jump.x}
              y={jump.y}
              onClose={() => setJump(undefined)}
              items={GROUPS.map((group) => ({
                label: group.label,
                run: () => {
                  const section = host.current?.querySelector<HTMLElement>(`#colors-${group.key}`);
                  section?.scrollIntoView({ block: "start" });
                  section?.querySelector<HTMLElement>(".color-hex")?.focus({ preventScroll: true });
                },
              }))}
            />
          )}
        </div>
      </div>
      <section className="shortcut-group" aria-labelledby="color-preview">
        <h3 id="color-preview" className="setting-label">
          Preview
        </h3>
        <ColorPreview set={set} />
      </section>
      {GROUPS.map((group) => {
        const roles = ROLES.filter((role) => role.group === group.key);
        return (
          <section key={group.key} className="shortcut-group color-group" id={`colors-${group.key}`} aria-labelledby={`colors-${group.key}-label`}>
            <div className="color-group-head">
              <div>
                <h3 id={`colors-${group.key}-label`} className="setting-label">
                  {group.label}
                </h3>
                {group.key === "code" && <span className="setting-hint">Syntax colors in code blocks and in Source mode. They don't follow the base colors.</span>}
                {group.key === "inline" && (
                  <span className="setting-hint">
                    Like{" "}
                    <code className="color-inline-sample color-scope" data-theme={set}>
                      this
                    </code>{" "}
                    in a paragraph.
                  </span>
                )}
              </div>
              {roles.some((role) => changed[role.key]) && (
                <button className="text-btn small" aria-label={`Reset ${group.label} colors`} onClick={() => onChange(withoutGroup(colors, set, group.key))}>
                  Reset group
                </button>
              )}
            </div>
            {group.key === "code" && <CodeSample set={set} />}
            <ul className="shortcut-list">
              {roles.map((role) => (
                <ColorRow
                  key={set + role.key}
                  id={`role${role.key}`}
                  label={role.label}
                  help={role.help}
                  tag={changed[role.key] ? undefined : roleTag(role)}
                  value={changed[role.key] ?? values[role.key] ?? role[set] ?? "#000000"}
                  changed={!!changed[role.key]}
                  resetTip={roleResetTip(role, set)}
                  warning={warnings[role.key]}
                  onPick={(hex) => onChange(withRole(colors, set, role.key, hex))}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

type RowProps = {
  id: string;
  label: string;
  help?: string;
  /** What the color follows while it isn't changed. */
  tag?: string;
  value: string;
  changed: boolean;
  resetTip: string;
  /** A contrast warning, shown under the row; it doesn't stop the change. */
  warning?: string;
  onPick: (hex: string | undefined) => void;
};

/** One color. A typed value is checked when the field is left or Enter is pressed; a bad one changes nothing. */
function ColorRow({ id, label, help, tag, value, changed, resetTip, warning, onPick }: RowProps) {
  const [draft, setDraft] = useState<string>();
  const [bad, setBad] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
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
  const describedBy = [bad && `${id}-error`, tag && `${id}-tag`, help && `${id}-help`, warning && `${id}-warning`].filter(Boolean).join(" ");
  return (
    <li className="shortcut-row color-row">
      <span className="shortcut-label">
        <span className="color-name">
          <label htmlFor={id}>{label}</label>
          {tag && (
            <span className="color-tag" id={`${id}-tag`}>
              {tag}
            </span>
          )}
        </span>
        {help && (
          <span className="setting-hint" id={`${id}-help`}>
            {help}
          </span>
        )}
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
        aria-describedby={describedBy || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
      <button className="icon-btn" aria-label={`Reset ${label}`} {...described(resetTip)} hidden={!changed} onClick={() => pick(undefined)}>
        <Icon name="revert" />
      </button>
      {bad && (
        <span className="color-error" id={`${id}-error`}>
          <Icon name="warning" size="inline" />
          Enter # and six hex digits, such as #d39d3f. {label} stays as it was.
        </span>
      )}
      {warning && (
        <span className="color-warning" id={`${id}-warning`}>
          <Icon name="warning" size="inline" />
          {warning}
        </span>
      )}
    </li>
  );
}

/** Hidden elements drawn in each role's color, read to show the colors roles follow. */
function Probes() {
  return (
    <div hidden>
      {ROLES.map(({ key }) => (
        <span key={key} data-role={key} style={{ background: `var(${key})` }} />
      ))}
    </div>
  );
}

/** A small sidebar and document drawn with the app's own classes in the colors of `set`. */
function ColorPreview({ set }: { set: ColorSet }) {
  return (
    <div className="color-preview color-scope" data-theme={set} inert aria-hidden="true">
      <Probes />
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

/** A few lines of code with the syntax colors of `set`. */
function CodeSample({ set }: { set: ColorSet }) {
  return (
    <pre className="color-code-sample color-scope" data-theme={set} aria-hidden="true">
      <code>
        <span className="hljs-comment">// Opens a document at a line</span>
        {"\n"}
        <span className="hljs-keyword">function</span> <span className="hljs-title function_">open</span>(path: <span className="hljs-type">string</span>, line ={" "}
        <span className="hljs-number">12</span>) {"{"}
        {"\n  "}
        <span className="hljs-keyword">const</span> doc = {"{ "}
        <span className="hljs-attr">kind</span>: <span className="hljs-string">"markdown"</span>, <span className="hljs-attr">large</span>:{" "}
        <span className="hljs-literal">true</span>
        {" };\n  "}
        <span className="hljs-keyword">return</span> <span className="hljs-title function_">show</span>(doc, line);
        {"\n}"}
      </code>
    </pre>
  );
}
