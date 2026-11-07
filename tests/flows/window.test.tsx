// @vitest-environment jsdom
// The window through the whole App: shown once after launch, its title, its background, and What's new on
// the first launch after an update.
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { calls, click, FILE, launch, settle, setUpFlow, tabNames, tearDownFlow, until, type Flow } from "../support/appFlow";

let flow: Flow;

beforeEach(() => {
  flow = setUpFlow({ [FILE]: "# Title\n\nText.\n" });
  // jsdom loads no stylesheet, so the color the window background is read from is stubbed by theme.
  const real = window.getComputedStyle;
  vi.stubGlobal("getComputedStyle", (el: Element) => {
    const style = real(el);
    const theme = (el as HTMLElement).dataset?.theme;
    return new Proxy(style, {
      get: (target, name) =>
        name === "getPropertyValue" ? (p: string) => (p === "--chrome" && theme ? (theme === "dark" ? "#101010" : "#f0f0f0") : target.getPropertyValue(p)) : Reflect.get(target, name),
    });
  });
});

afterEach(tearDownFlow);

const last = <T,>(list: T[]) => list[list.length - 1];
const shows = () => calls(flow, "plugin:window|show").length;
const titles = () => calls(flow, "plugin:window|set_title").map((c) => c.args.value);
const backgrounds = () => calls(flow, "plugin:window|set_background_color").map((c) => c.args.value);

test("the window is shown once, after the command-line file has started opening", async () => {
  let release!: () => void;
  flow.initialGate = new Promise((done) => (release = done));
  await launch(flow, {}, ".app");
  await settle(50);
  expect(shows()).toBe(0);
  release();
  await until(() => flow.host.querySelector(".doc-column"), "the document");
  await settle(50);
  expect(shows()).toBe(1);
  await click(flow.host.querySelector('button[aria-label="Home"]'));
  await settle(50);
  expect(shows()).toBe(1);
});

test("the window is shown once on the home screen when no file is passed", async () => {
  flow.initialFile = null;
  await launch(flow, {}, ".app");
  await until(() => shows() > 0, "the window to show");
  await settle(50);
  expect(shows()).toBe(1);
  expect(flow.host.querySelector(".doc-column")).toBeNull();
});

test("the title names the shown document and is Octavo on the home screen", async () => {
  await launch(flow);
  await until(() => last(titles()) === "note.md — Octavo", "the document's title");
  expect(titles()[0]).toBe("Octavo");
  await click(flow.host.querySelector('button[aria-label="Home"]'));
  await until(() => last(titles()) === "Octavo", "the home title");
});

test("the window background follows the theme", async () => {
  await launch(flow);
  expect(last(backgrounds())).toBe("#f0f0f0");
  flow.systemDark.matches = true;
  await act(async () => flow.systemDark.listeners.forEach((fn) => fn()));
  await until(() => last(backgrounds()) === "#101010", "the dark background");
  expect(flow.host.querySelector(".app")?.getAttribute("data-theme")).toBe("dark");
  expect(shows()).toBe(1);
});

test("the first launch after an update opens What's new, then the command-line file", async () => {
  flow.version = "0.6.0";
  localStorage.setItem("lastVersion", JSON.stringify("0.5.0"));
  await launch(flow);
  await until(() => tabNames(flow).length === 2, "two tabs");
  expect(tabNames(flow)).toEqual(["0.6.0.md", "note.md"]);
  expect(calls(flow, "write_notes")).toHaveLength(1);
});
