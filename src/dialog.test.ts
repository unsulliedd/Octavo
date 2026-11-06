// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from "vitest";
import { ask, choose, message, promptText } from "./dialog";

const box = () => document.querySelector<HTMLElement>(".app-dialog");
const buttons = () => [...(box()?.querySelectorAll("button") ?? [])];
const button = (label: string) => buttons().find((b) => b.textContent === label)!;
const key = (k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  (document.activeElement ?? document.body).dispatchEvent(e);
  return e;
};
const SAVE = [
  { value: "save", label: "Save", look: "primary" as const },
  { value: "discard", label: "Don't save", look: "danger" as const },
  { value: "cancel", label: "Cancel" },
];

let before: HTMLButtonElement;

beforeEach(() => {
  before = document.createElement("button");
  before.textContent = "Before";
  document.body.append(before);
  before.focus();
});

afterEach(() => {
  // Closes whatever a test left open.
  while (box()) key("Escape");
  document.body.replaceChildren();
});

test("a question is an alert dialog named by its title and described by its text", () => {
  void ask("Revert notes.md?", { okLabel: "Revert", cancelLabel: "Keep editing", danger: true });
  const dialog = box()!;
  expect(dialog.getAttribute("role")).toBe("alertdialog");
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Octavo");
  expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe("Revert notes.md?");
  expect(buttons().map((b) => b.textContent)).toEqual(["Revert", "Keep editing"]);
  expect(button("Revert").className).toBe("text-btn danger");
  expect(button("Keep editing").className).toBe("text-btn");
});

test("the first button has focus, and focus goes back when the dialog closes", async () => {
  const answer = ask("Remove?", { okLabel: "Remove", cancelLabel: "Keep" });
  expect(document.activeElement).toBe(button("Remove"));
  button("Keep").click();
  expect(await answer).toBe(false);
  expect(box()).toBeNull();
  expect(document.activeElement).toBe(before);
});

test("ask resolves to true for the first button", async () => {
  const answer = ask("Remove?", { okLabel: "Remove", cancelLabel: "Keep" });
  button("Remove").click();
  expect(await answer).toBe(true);
});

test("choose resolves to the value of the button picked", async () => {
  const answer = choose("Save your changes?", SAVE, "cancel");
  expect(button("Save").className).toBe("text-btn primary");
  button("Don't save").click();
  expect(await answer).toBe("discard");
});

test("Enter picks the focused button", async () => {
  const answer = choose("Save your changes?", SAVE, "cancel");
  expect(key("Enter").defaultPrevented).toBe(true);
  expect(await answer).toBe("save");
  const second = choose("Save your changes?", SAVE, "cancel");
  button("Don't save").focus();
  key("Enter");
  expect(await second).toBe("discard");
});

test("Escape and a click beside the dialog dismiss it", async () => {
  const escaped = choose("Save your changes?", SAVE, "cancel");
  key("Escape");
  expect(await escaped).toBe("cancel");
  const clicked = ask("Remove?");
  box()!.click();
  expect(box()).not.toBeNull();
  document.querySelector<HTMLElement>(".app-dialog-backdrop")!.click();
  expect(await clicked).toBe(false);
});

test("a message has one button and resolves when closed", async () => {
  let closed = false;
  void message("The image couldn't be added.").then(() => (closed = true));
  expect(buttons().map((b) => b.textContent)).toEqual(["OK"]);
  key("Escape");
  await Promise.resolve();
  expect(closed).toBe(true);
});

test("Tab and Shift+Tab stay on the dialog's buttons", () => {
  void choose("Save your changes?", SAVE, "cancel");
  key("Tab");
  expect(document.activeElement).toBe(button("Don't save"));
  key("Tab");
  key("Tab");
  expect(document.activeElement).toBe(button("Save"));
  expect(key("Tab", { shiftKey: true }).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(button("Cancel"));
  // Focus that left the buttons comes back to the first.
  before.focus();
  key("Tab");
  expect(document.activeElement).toBe(button("Save"));
});

test("while a dialog is open, no other listener of the window sees a key", () => {
  const seen: string[] = [];
  const listen = (e: KeyboardEvent) => seen.push(e.key);
  window.addEventListener("keydown", listen, true);
  window.addEventListener("keydown", listen);
  try {
    key("s", { ctrlKey: true });
    expect(seen).toEqual(["s", "s"]);
    void ask("Remove?");
    const e = key("w", { ctrlKey: true });
    key("p", { ctrlKey: true });
    expect(seen).toEqual(["s", "s"]);
    expect(e.defaultPrevented).toBe(true);
    // Alt keys and Space keep their default action.
    expect(key("F4", { altKey: true }).defaultPrevented).toBe(false);
    expect(key(" ").defaultPrevented).toBe(false);
  } finally {
    window.removeEventListener("keydown", listen, true);
    window.removeEventListener("keydown", listen);
  }
});

test("a second request waits for the first, never on top of it", async () => {
  const first = ask("First?");
  const second = message("Second.");
  expect(document.querySelectorAll(".app-dialog")).toHaveLength(1);
  expect(box()!.textContent).toContain("First?");
  button("OK").click();
  expect(await first).toBe(true);
  expect(document.querySelectorAll(".app-dialog")).toHaveLength(1);
  expect(box()!.textContent).toContain("Second.");
  expect(document.activeElement).toBe(button("OK"));
  key("Enter");
  await second;
  expect(box()).toBeNull();
  expect(document.activeElement).toBe(before);
});

test("text keeps its line breaks and is set as text", () => {
  void message("These documents couldn't be saved:\n\n<b>a.md</b>");
  const p = box()!.querySelector("p")!;
  expect(p.textContent).toBe("These documents couldn't be saved:\n\n<b>a.md</b>");
  expect(p.querySelector("b")).toBeNull();
});

const field = () => box()!.querySelector("input")!;
const type = (value: string) => {
  field().value = value;
  field().dispatchEvent(new Event("input", { bubbles: true }));
};
const titleOf = () => document.getElementById(box()!.getAttribute("aria-labelledby")!)!.textContent;

test("ask, message and choose take a title, Octavo by default", async () => {
  void ask("Remove?", { title: "Remove workspace" });
  expect(titleOf()).toBe("Remove workspace");
  key("Escape");
  void message("Done.", { title: "Saved" });
  expect(titleOf()).toBe("Saved");
  key("Escape");
  void choose("Save?", SAVE, "cancel", { title: "Close tab" });
  expect(titleOf()).toBe("Close tab");
  key("Escape");
  void message("Done.");
  expect(titleOf()).toBe("Octavo");
});

test("a prompt is a dialog with a labelled field that has the focus and its text selected", () => {
  void promptText("The folder on disk keeps its name.", { title: "Rename workspace", value: "Handbook", okLabel: "Rename" });
  const dialog = box()!;
  expect(dialog.getAttribute("role")).toBe("dialog");
  expect(titleOf()).toBe("Rename workspace");
  expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe("The folder on disk keeps its name.");
  expect(dialog.querySelector(`label[for="${field().id}"]`)!.textContent).toBe("Name");
  expect(document.activeElement).toBe(field());
  expect([field().selectionStart, field().selectionEnd]).toEqual([0, "Handbook".length]);
  expect(buttons().map((b) => b.textContent)).toEqual(["Rename", "Cancel"]);
  expect(button("Rename").className).toBe("text-btn primary");
});

test("a prompt resolves to the trimmed text, or to undefined when cancelled", async () => {
  const named = promptText("", { title: "New workspace" });
  type("  Travel  ");
  button("OK").click();
  expect(await named).toBe("Travel");
  const cancelled = promptText("", { value: "Travel" });
  button("Cancel").click();
  expect(await cancelled).toBeUndefined();
  const escaped = promptText("", { value: "Travel" });
  key("Escape");
  expect(await escaped).toBeUndefined();
  const beside = promptText("", { value: "Travel" });
  document.querySelector<HTMLElement>(".app-dialog-backdrop")!.click();
  expect(await beside).toBeUndefined();
});

test("a prompt with no text has no description", () => {
  void promptText("", { title: "Rename workspace" });
  expect(box()!.hasAttribute("aria-describedby")).toBe(false);
  expect(box()!.querySelector("p")).toBeNull();
});

test("OK is disabled while the field is blank, and Enter in the field does nothing then", async () => {
  let answer: string | undefined | null = null;
  void promptText("", { okLabel: "Create" }).then((a) => (answer = a));
  expect(button("Create").disabled).toBe(true);
  type("   ");
  expect(button("Create").disabled).toBe(true);
  expect(key("Enter").defaultPrevented).toBe(true);
  await Promise.resolve();
  expect(answer).toBeNull();
  expect(box()).not.toBeNull();
  type("Reading list");
  expect(button("Create").disabled).toBe(false);
  key("Enter");
  await Promise.resolve();
  expect(answer).toBe("Reading list");
});

test("in the field, keys that type and edit keep their default, and the app's shortcuts still wait", () => {
  const seen: string[] = [];
  const listen = (e: KeyboardEvent) => seen.push(e.key);
  window.addEventListener("keydown", listen);
  try {
    void promptText("");
    for (const k of ["a", "Z", " ", "Backspace", "Delete", "ArrowLeft", "Home", "End"]) expect(key(k).defaultPrevented).toBe(false);
    expect(key("ArrowLeft", { shiftKey: true }).defaultPrevented).toBe(false);
    for (const k of ["a", "c", "v", "x", "z", "y"]) expect(key(k, { ctrlKey: true }).defaultPrevented).toBe(false);
    for (const k of ["p", "w", "s"]) expect(key(k, { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(key("F5").defaultPrevented).toBe(true);
    expect(seen).toEqual([]);
    // On a button, a letter does nothing.
    button("Cancel").focus();
    expect(key("a").defaultPrevented).toBe(true);
  } finally {
    window.removeEventListener("keydown", listen);
  }
});

test("Tab goes from the field to the buttons that can be pressed and back", () => {
  void promptText("");
  key("Tab");
  // OK is disabled while the field is blank, so Tab passes over it.
  expect(document.activeElement).toBe(button("Cancel"));
  key("Tab");
  expect(document.activeElement).toBe(field());
  type("Travel");
  key("Tab");
  expect(document.activeElement).toBe(button("OK"));
  key("Tab", { shiftKey: true });
  expect(document.activeElement).toBe(field());
  key("Tab", { shiftKey: true });
  expect(document.activeElement).toBe(button("Cancel"));
});

test("Enter on Cancel cancels a prompt", async () => {
  const answer = promptText("", { value: "Travel" });
  button("Cancel").focus();
  key("Enter");
  expect(await answer).toBeUndefined();
});

test("a dialog opened before anything else has focus still shows on the body", async () => {
  before.remove();
  const answer = ask("Remove?");
  expect(box()!.parentElement!.parentElement).toBe(document.body);
  key("Escape");
  expect(await answer).toBe(false);
});
