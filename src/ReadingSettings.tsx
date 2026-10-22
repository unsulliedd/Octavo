import { useEffect, useRef } from "react";
import { Icon, type IconName } from "./icons";
import { keyLabel } from "./shortcuts";
import type { LineWidth, Prefs, Theme } from "./storage";

type Props = {
  prefs: Prefs;
  onChange: (prefs: Prefs) => void;
  focusMode: boolean;
  /** Missing while no document is open. */
  onFocusMode?: (on: boolean) => void;
  onClose: () => void;
};

export function Segmented<T extends string>({ label, value, options, onPick, hint }: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onPick: (value: T) => void;
  hint?: string;
}) {
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} aria-pressed={o.value === value} onClick={() => onPick(o.value)} data-value={o.value}>
            {o.icon && <Icon name={o.icon} />}
            {o.label}
          </button>
        ))}
      </div>
      {hint && <span className="setting-hint">{hint}</span>}
    </div>
  );
}

/** Popover under the toolbar's "T" button, for how documents look. Closes on Escape or a click outside. */
export function ReadingSettings({ prefs, onChange, focusMode, onFocusMode, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);
  const set = (patch: Partial<Prefs>) => onChange({ ...prefs, ...patch });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!panel.current?.contains(target) && !target.closest("[data-settings-toggle]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <section className="popover" ref={panel} aria-label="Reading settings">
      <Segmented<Theme>
        label="Theme"
        value={prefs.theme}
        onPick={(theme) => set({ theme })}
        options={[
          { value: "light", label: "Light", icon: "sun" },
          { value: "dark", label: "Dark", icon: "moon" },
          { value: "system", label: "System", icon: "monitor" },
        ]}
      />
      <Segmented
        label="Document font"
        value={prefs.font}
        onPick={(font) => set({ font })}
        options={[
          { value: "sans", label: "Sans" },
          { value: "serif", label: "Serif" },
        ]}
      />
      <div className="setting">
        <label className="setting-label" htmlFor="text-size">
          <span>Text size</span>
          <span className="setting-value">{prefs.size} px</span>
        </label>
        <input
          id="text-size"
          type="range"
          min={13}
          max={22}
          value={prefs.size}
          onChange={(e) => set({ size: Number(e.target.value) })}
        />
      </div>
      <Segmented<LineWidth>
        label="Line width"
        value={prefs.width}
        onPick={(width) => set({ width })}
        options={[
          { value: "narrow", label: "Narrow" },
          { value: "medium", label: "Medium" },
          { value: "default", label: "Default" },
          { value: "wide", label: "Wide" },
          { value: "wider", label: "Wider" },
        ]}
      />
      <label className="setting-toggle">
        <span>Show outline</span>
        <input type="checkbox" checked={prefs.outline} onChange={(e) => set({ outline: e.target.checked })} />
      </label>
      <label className="setting-toggle plain">
        <span>Show properties</span>
        <input type="checkbox" checked={prefs.properties} onChange={(e) => set({ properties: e.target.checked })} />
      </label>
      <label className="setting-toggle plain">
        <span>Wide tables use the window width</span>
        <input type="checkbox" checked={prefs.wideBlocks} onChange={(e) => set({ wideBlocks: e.target.checked })} />
      </label>
      <label className="setting-toggle plain">
        <span>
          Distraction-free mode {keyLabel(prefs.shortcuts, "toggleFocus") && <kbd>{keyLabel(prefs.shortcuts, "toggleFocus")}</kbd>}
        </span>
        <input
          type="checkbox"
          checked={focusMode}
          disabled={!onFocusMode}
          onChange={(e) => onFocusMode?.(e.target.checked)}
        />
      </label>
    </section>
  );
}
