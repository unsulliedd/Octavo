import { useEffect, useLayoutEffect, useState } from "react";
import { applyColors } from "./colors";
import { loadPrefs, save, type Prefs } from "./storage";

function useSystemDark() {
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/** The preferences, saved when they change, and whether the dark theme shows. */
export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const systemDark = useSystemDark();
  const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark);

  const changePrefs = (next: Prefs) => {
    setPrefs(next);
    save("prefs", next);
  };

  // The colors changed in Settings › Colors, as custom properties on the root that every other color derives from:
  // the base colors, and the changed roles of the theme that shows.
  useLayoutEffect(() => applyColors(document.documentElement.style, prefs.colors, dark), [prefs.colors, dark]);

  return { prefs, changePrefs, dark };
}
