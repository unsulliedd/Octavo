import { useEffect, useRef } from "react";
import { shortcut, type Action, type Bindings } from "./shortcuts";

type ShortcutState = Parameters<typeof shortcut>[2];

/**
 * Runs the window's keyboard shortcuts through `run`. The listener is registered once and reads the latest
 * arguments; `blocked` holds the keys back while the large view or quick open takes them.
 */
export function useShortcuts(bindings: Bindings, state: ShortcutState, blocked: boolean, run: (action: Action) => void) {
  const latest = useRef({ bindings, state, blocked, run });
  latest.current = { bindings, state, blocked, run };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A key the editor used for one of its shortcuts is not the window's too.
      if (e.defaultPrevented) return;
      // The large view and quick open take the keys while they are open.
      if (latest.current.blocked) return;
      const action = shortcut(e, latest.current.bindings, latest.current.state);
      if (!action) return;
      e.preventDefault();
      latest.current.run(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
