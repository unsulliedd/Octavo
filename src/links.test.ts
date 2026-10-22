import { expect, test } from "vitest";
import { LINKS, releaseUrl } from "./links";

test("the pages About links to", () => {
  expect(LINKS).toEqual({
    repository: "https://github.com/unsulliedd/Octavo",
    releases: "https://github.com/unsulliedd/Octavo/releases",
    newIssue: "https://github.com/unsulliedd/Octavo/issues/new",
    license: "https://github.com/unsulliedd/Octavo/blob/main/LICENSE",
  });
});

test("the release page of a version, with or without a leading v", () => {
  expect(releaseUrl("0.5.1")).toBe("https://github.com/unsulliedd/Octavo/releases/tag/v0.5.1");
  expect(releaseUrl("v0.5.1")).toBe("https://github.com/unsulliedd/Octavo/releases/tag/v0.5.1");
});
