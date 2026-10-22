import { expect, test } from "vitest";
import { DEFAULT_PREFS } from "../storage";
import { editorLayout } from "./layout";

test("the default layout keeps everything in the formatting bar row", () => {
  expect(editorLayout(DEFAULT_PREFS)).toEqual({
    barRow: true,
    floating: false,
    actionsInBar: true,
    status: "status",
    linkInBar: true,
    linkPopover: false,
  });
});

test("both formatting bars, and links in both places", () => {
  const layout = editorLayout({ ...DEFAULT_PREFS, formatBar: "both", linkDetails: "both" });
  expect(layout).toMatchObject({ barRow: true, floating: true, linkInBar: true, linkPopover: true });
});

test("save buttons and status can leave the row while it stays", () => {
  const layout = editorLayout({ ...DEFAULT_PREFS, saveButtons: "toolbar", saveStatus: "toolbar" });
  expect(layout).toMatchObject({ barRow: true, actionsInBar: false, status: "toolbar" });
  expect(editorLayout({ ...DEFAULT_PREFS, saveStatus: "bar" }).status).toBe("bar");
});

test("without the row, its contents move to the toolbar and the popover", () => {
  for (const formatBar of ["floating", "hidden"] as const) {
    const layout = editorLayout({ ...DEFAULT_PREFS, formatBar, saveStatus: "bar", linkDetails: "bar" });
    expect(layout).toMatchObject({ barRow: false, actionsInBar: false, status: "toolbar", linkInBar: false, linkPopover: true });
  }
  expect(editorLayout({ ...DEFAULT_PREFS, formatBar: "hidden" }).floating).toBe(false);
});
