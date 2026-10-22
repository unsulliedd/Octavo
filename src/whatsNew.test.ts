import { expect, test } from "vitest";
import { changelogSection, newer, notesPage, showAfterUpdate } from "./whatsNew";

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

## [1.0.1] - 2027-02-15

### Fixed
- A fix

## [1.0.0] - 2027-02-01

### Added
- A feature

### Changed
- A change

## [0.9.0] - 2027-01-10

### Added
- Older
`;

test("a version's section runs up to the next version, with its date", () => {
  expect(changelogSection(CHANGELOG, "1.0.0")).toEqual({ date: "2027-02-01", body: "### Added\n- A feature\n\n### Changed\n- A change" });
  expect(changelogSection(CHANGELOG, "0.9.0")).toEqual({ date: "2027-01-10", body: "### Added\n- Older" });
});

test("a version the changelog doesn't have has no section", () => {
  expect(changelogSection(CHANGELOG, "0.8.0")).toBeUndefined();
  // 1.0.1 is not the start of 1.0.10.
  expect(changelogSection(CHANGELOG.replace("[1.0.1]", "[1.0.10]"), "1.0.1")).toBeUndefined();
});

test("Windows line endings", () => {
  expect(changelogSection(CHANGELOG.replace(/\n/g, "\r\n"), "1.0.1")).toEqual({ date: "2027-02-15", body: "### Fixed\n- A fix" });
});

test("the page has a title, the date when known, the notes and a link to every release", () => {
  expect(notesPage("1.0.1", "### Fixed\n- A fix\n", "2027-02-15")).toBe(
    "# What's new in Octavo 1.0.1\n\nReleased 2027-02-15\n\n### Fixed\n- A fix\n\n[All releases](https://github.com/unsulliedd/Octavo/releases)\n",
  );
  expect(notesPage("1.0.1", "")).toBe("# What's new in Octavo 1.0.1\n\nNo notes for this release.\n\n[All releases](https://github.com/unsulliedd/Octavo/releases)\n");
});

test("versions compare by their numbers", () => {
  expect(newer("1.0.1", "1.0.0")).toBe(true);
  expect(newer("0.10.0", "0.9.9")).toBe(true);
  expect(newer("v1.0.0", "0.9.0")).toBe(true);
  expect(newer("1.0.0", "1.0.0")).toBe(false);
  expect(newer("1.0", "1.0.0")).toBe(false);
  expect(newer("0.9.0", "1.0.0")).toBe(false);
});

test("What's new opens after an update, not on a first launch or a downgrade", () => {
  expect(showAfterUpdate("1.0.0", "1.0.1")).toBe(true);
  expect(showAfterUpdate(undefined, "1.0.1")).toBe(false);
  expect(showAfterUpdate("1.0.1", "1.0.1")).toBe(false);
  expect(showAfterUpdate("1.0.1", "1.0.0")).toBe(false);
});
