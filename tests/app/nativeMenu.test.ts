// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { installNativeMenuGuard } from "@/app/nativeMenu";

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  document.body.innerHTML = "";
});

/** Right-clicks the element matching `selector` and says whether the default menu was prevented. */
function prevented(html: string, selector: string) {
  document.body.innerHTML = html;
  stop = installNativeMenuGuard();
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  document.querySelector(selector)!.dispatchEvent(e);
  return e.defaultPrevented;
}

test("the default menu is hidden on Home, text and buttons", () => {
  expect(prevented("<main><p>text</p></main>", "p")).toBe(true);
  expect(prevented('<main><input type="checkbox"><button>Go</button></main>', "input")).toBe(true);
  expect(prevented("<button>Go</button>", "button")).toBe(true);
});

test("text fields, the editor and Source mode keep the default menu", () => {
  expect(prevented('<input type="text">', "input")).toBe(false);
  expect(prevented("<input>", "input")).toBe(false);
  expect(prevented('<input type="search">', "input")).toBe(false);
  expect(prevented("<textarea></textarea>", "textarea")).toBe(false);
  expect(prevented('<div contenteditable="true"><p>typed</p></div>', "p")).toBe(false);
  expect(prevented('<div contenteditable="plaintext-only">x</div>', "div")).toBe(false);
  expect(prevented('<div class="cm-editor"><div class="cm-content"><div class="cm-line">src</div></div></div>', ".cm-line")).toBe(false);
});

test("a read-only part of the editor is not a text field", () => {
  expect(prevented('<div contenteditable="true"><div contenteditable="false"><span>diagram</span></div></div>', "span")).toBe(false);
  expect(prevented('<div contenteditable="false"><span>x</span></div>', "span")).toBe(true);
});

test("a text field inside an app menu keeps the default menu", () => {
  expect(prevented('<div role="menu"><input type="text"></div>', "input")).toBe(false);
  expect(prevented('<div role="menu"><button>Rename</button></div>', "button")).toBe(true);
});

test("a menu the app opens itself still works and the guard stops with its cleanup", () => {
  document.body.innerHTML = '<div id="row"></div>';
  let opened = 0;
  document.getElementById("row")!.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    opened++;
  });
  stop = installNativeMenuGuard();
  document.getElementById("row")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  expect(opened).toBe(1);
  stop();
  stop = undefined;
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  document.body.dispatchEvent(e);
  expect(e.defaultPrevented).toBe(false);
});
