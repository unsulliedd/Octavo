import { createContext, useContext } from "react";
import { withKeys, type Bindings, type ShortcutId } from "./shortcuts";

/** The shortcut keys the user changed, for tooltips and hints anywhere in the window. */
export const KeysContext = createContext<Bindings>({});

export const useKeys = () => useContext(KeysContext);

/** A tooltip with an action's current keys after it: `tip("Save", "save")` is "Save (Ctrl+S)". */
export function useTip() {
  const bindings = useKeys();
  return (label: string, id: ShortcutId) => withKeys(label, bindings, id);
}
