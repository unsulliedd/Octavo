// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { useModalFocus } from "./modalFocus";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Dialog({ onClose }: { onClose: () => void }) {
  const trap = useModalFocus();
  return (
    <div role="dialog" onKeyDown={trap}>
      <button id="first" autoFocus onClick={onClose}>
        Close
      </button>
      <button disabled>Disabled</button>
      <input id="last" />
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button id="opener" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
}

let host: HTMLElement;
let root: Root;
afterEach(() => act(async () => root.unmount()));

const tab = (shiftKey = false) =>
  act(async () => void document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true })));

test("Tab wraps inside the dialog, and closing it puts the focus back on what opened it", async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
  const opener = host.querySelector<HTMLElement>("#opener")!;
  opener.focus();
  await act(async () => opener.click());
  expect(document.activeElement?.id).toBe("first");
  await tab();
  expect(document.activeElement?.id).toBe("last");
  await tab();
  expect(document.activeElement?.id).toBe("first");
  await tab(true);
  expect(document.activeElement?.id).toBe("last");
  await act(async () => host.querySelector<HTMLElement>("#first")!.click());
  expect(document.activeElement).toBe(opener);
});
