import { useState } from "react";
import { keyLabel, type Bindings } from "@/app/shortcuts";
import { Icon } from "@/ui/icons";
import { TabMenu, type TabMenuItem } from "@/ui/TabMenu";
import type { ExportKind } from "./exportPage";

/** The two exports, labelled `label(kind)`, with their shortcut keys. */
const items = (bindings: Bindings, run: (kind: ExportKind) => void, label: (kind: string) => string): TabMenuItem[] => [
  { label: label("HTML"), keys: keyLabel(bindings, "exportHtml"), run: () => run("html") },
  { label: label("PDF"), keys: keyLabel(bindings, "exportPdf"), run: () => run("pdf") },
];

/** Export › with HTML… and PDF…, for the tab menu. */
export const exportItem = (bindings: Bindings, run: (kind: ExportKind) => void): TabMenuItem => ({
  label: "Export",
  submenu: items(bindings, run, (kind) => `${kind}…`),
});

/** The toolbar's Export button, with its menu right under it. */
export function ExportButton({ bindings, onExport }: { bindings: Bindings; onExport: (kind: ExportKind) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  return (
    <>
      <button
        className="icon-btn"
        data-menu-toggle
        aria-label="Export"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          // The menu is 260px wide with its padding and border; it ends where the button ends.
          setMenu((m) => (m ? undefined : { x: box.right - 260, y: box.bottom + 4 }));
        }}
      >
        <Icon name="export" />
      </button>
      {menu && <TabMenu name="Export" x={menu.x} y={menu.y} items={items(bindings, onExport, (kind) => `Export as ${kind}…`)} onClose={() => setMenu(undefined)} />}
    </>
  );
}
