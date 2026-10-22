# Working on Octavo

Bug reports and ideas are welcome as [issues](../../issues). Before starting on a larger change, open an issue to talk it through.

## Getting started

Requirements: Node.js 24, Rust (stable), and on Windows the Visual Studio C++ build tools and WebView2 (included in Windows 11).

```bash
npm install
```
```bash
npm run tauri dev
```

Pass a file to open it on start: `npm run tauri dev -- -- -- path/to/file.md`.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (render pipeline, editor and saving, find, tabs) |
| `npm run fidelity` | Editor round-trip report, see [docs/editor-fidelity.md](docs/editor-fidelity.md) |
| `npx tauri build --no-bundle` | Release executable without installers |
| `npm run perf` | Launch-to-rendered timing of the release build (Windows) |
| `npm run updater-test` | Builds an old copy and an update, and serves them locally to try the updater (Windows, needs the updater key) |
| `npm run perf:render` | Render pipeline timing on ~1 MB documents, compared with `main` (`BASE=<git ref>` for another version) |

### Icon and images

`media/icon.svg` is the app icon's source; `npx tauri icon media/icon.svg` writes every size to `src-tauri/icons` (the Android and iOS folders it also writes are ignored). The installer images and the GitHub social preview (also the README banner) are HTML pages in `media/`; `powershell -ExecutionPolicy Bypass -File media/render.ps1` renders them with Microsoft Edge (Windows).

## Branches and pull requests

- `main` always builds and passes CI. Releases are tagged from it.
- One branch per change, named `<type>/<short-name>`: `feature/code-highlighting`, `fix/footnote-links`, `chore/release-workflow`, `docs/readme`.
- Before every commit, run the checks under [Checks to run locally](#checks-to-run-locally). Open a pull request into `main`.
- CI runs `npm test`, the type check and the production build on pull requests from outside contributors (members run them locally, or start CI by hand from the Actions tab), and `cargo test` on Linux and Windows on every pull request that changes `src-tauri/`. When it runs, it must pass.
- Merge with **Rebase and merge**, so each commit lands on `main` as written.

## Commits

- Plain imperative subject, no `feat:` / `fix:` prefix: `Add code syntax highlighting`
- Body: one `-` bullet per task, no manual line wrapping. A single-task commit can be the subject only.

## Changelog

Every user-visible change adds a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md), in the same pull request. Group lines under `### Added`, `### Changed`, `### Fixed` or `### Removed`.

## Versions

[Semantic Versioning](https://semver.org/), tags `vX.Y.Z`.

- Until 1.0.0, `minor` adds features and `patch` fixes bugs.
- No `-alpha.1` style suffixes: the Windows MSI installer only accepts numeric versions.
- The version lives in `package.json`. `tauri.conf.json` reads it from there, and `npm version` copies it into `src-tauri/Cargo.toml` and `Cargo.lock` (`scripts/sync-version.mjs`). Between releases `main` carries the last released version.

## Releasing

1. On an up-to-date `main` with CI green and a filled `Unreleased` section:
   ```bash
   npm version minor
   ```
   (`patch` for a bug-fix release.) This bumps the version everywhere, turns `Unreleased` into the new version's section, commits `Release X.Y.Z` and tags `vX.Y.Z`. If it stops, for example on an empty `Unreleased` section, nothing is committed or tagged; undo the bump with `git checkout -- package.json package-lock.json`.
2. Push the commit and the tag:
   ```bash
   git push --follow-tags
   ```
3. The **Release** workflow builds the Windows installers (`.exe` and `.msi`), signs their update files and opens a draft GitHub release with the changelog section as its notes and the updater's `latest.json`.
4. Install the build from the draft, check it in the desktop app, then publish the release. Publishing it offers the update to every installed Octavo from 0.5.0 on, the next time it starts.

Builds are unsigned for now, so Windows SmartScreen warns on install.

### Updater key

The update files are signed with the updater key, and Octavo installs only updates signed with it. The workflow reads the key from the Actions secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of the key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; its public key is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. Keep a backup of the key file and its password: without them, installed copies can't take further updates, and everyone has to install the next release by hand.

A local `npx tauri build` needs the same two environment variables; `npx tauri build --no-bundle` doesn't.

Before a release that changes the updater, try it with `npm run updater-test`: it builds a copy versioned 0.0.1 that looks for updates on this machine and the current version as its update, serves both, and prints what to check.

## Checks to run locally

```bash
npm test
```
```bash
npm run build
```
```bash
npm run fidelity
```
`npm run build` type-checks and builds the production bundle. `npm run fidelity` is the Milkdown round-trip report, needed when touching `src/editor/` or `src/render.ts`. When `src-tauri/` changes, also run `cargo test` in `src-tauri/`. Before a release, also build with `npx tauri build --no-bundle` and run `npm run perf`.
