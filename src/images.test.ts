// @vitest-environment jsdom
import { expect, test } from "vitest";
import { missingImage, pastedName, replaceWithPlaceholder, watchBrokenImages } from "./images";

test("placeholder text names the missing file and the alt text", () => {
  expect(missingImage("../img/chart%20v2.png", "Sales chart")).toEqual({ label: "Image not found", detail: "Sales chart · chart v2.png" });
  expect(missingImage("C:\\pics\\a.png?v=2", "")).toEqual({ label: "Image not found", detail: "a.png" });
  expect(missingImage("img/a.png", "a.png")).toEqual({ label: "Image not found", detail: "a.png" });
  expect(missingImage("https://example.com/x/logo.svg", " ")).toEqual({ label: "Image couldn't be loaded", detail: "logo.svg" });
});

test("a failing image is replaced by its placeholder, with the document's source as tooltip", () => {
  const root = document.createElement("article");
  root.innerHTML = '<p>before <img src="http://asset.localhost/C%3A%5Cdocs%5Cimg.png" data-src="../img.png" alt="Diagram"> after</p>';
  document.body.append(root);
  const stop = watchBrokenImages(root);
  root.querySelector("img")!.dispatchEvent(new Event("error"));
  const box = root.querySelector(".img-missing") as HTMLElement;
  expect(root.querySelector("img")).toBeNull();
  expect(box.getAttribute("role")).toBe("img");
  expect(box.getAttribute("aria-label")).toBe("Image not found: Diagram · img.png");
  expect(box.title).toBe("../img.png");
  expect(box.textContent).toBe("Image not foundDiagram · img.png");
  expect(root.querySelector("p")!.textContent).toBe("before Image not foundDiagram · img.png after");
  stop();
});

test("images without data-src use their src", () => {
  const root = document.createElement("div");
  root.innerHTML = '<img src="https://example.com/a.png" alt="">';
  replaceWithPlaceholder(root.querySelector("img")!);
  expect(root.querySelector(".img-missing")!.getAttribute("aria-label")).toBe("Image couldn't be loaded: a.png");
});

test("pasted images keep their name; screenshots are named after the time", () => {
  const now = new Date(2026, 9, 20, 9, 5, 7);
  expect(pastedName({ name: "diagram.PNG", type: "image/png" }, now)).toBe("diagram.PNG");
  expect(pastedName({ name: "image.png", type: "image/png" }, now)).toBe("pasted-20261020-090507.png");
  expect(pastedName({ name: "", type: "image/jpeg" }, now)).toBe("pasted-20261020-090507.jpg");
  expect(pastedName({ name: "photo.heic", type: "image/heic" }, now)).toBeUndefined();
  expect(pastedName({ name: "C:\\fake\\shot.webp", type: "image/webp" }, now)).toBe("shot.webp");
});
