# Changelog

All notable changes to Octavo. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version adds features and a patch version fixes bugs.

## [Unreleased]

### Added
- Settings has an About section: Octavo's version, What's new, links to the release notes, the source code and a new problem report on GitHub, and the license
- Tabs can be dragged to a new place in the tab strip; the others make room as the dragged tab passes them, Escape puts it back, and the order is kept for the next launch
- Reopen closed tab (Ctrl+Shift+T) brings back the last closed tab where it was, with its back and forward history and scroll position; pressing it again goes further back. It can be given other keys in Settings › Shortcuts
- Octavo opens at the size and position its window had when it was closed, maximized again if it was; a window that would land on a monitor that's no longer connected opens centered instead

### Changed
- The update settings (Check for updates when Octavo starts, Check now and Restart now) are at the bottom of About; the Updates section is gone

## [0.5.2] - 2026-10-22

### Fixed
- Octavo keeps its settings, open tabs, recent files, backups and What's new pages in a folder named Octavo (`%APPDATA%\Octavo`) instead of one named after its internal identifier. Settings, tabs and recent files start fresh once. Uninstalling with "Delete the application data" removes this folder too

## [0.5.1] - 2026-10-22

### Fixed
- An image added from inside the document's repository or folder is linked where it is, also when its path is written with different capital letters; it was copied into the image folder before

## [0.5.0] - 2026-10-22

The first release of Octavo, a Markdown reader and editor for Windows. Free and open source under the MIT license.

### Added
- Reading view: GitHub Flavored Markdown with tables, task lists and footnotes, math, Mermaid diagrams, images, sanitized HTML, and highlighted code with a Copy button; frontmatter shows as properties
- Tabs restored on the next launch, an outline that follows your place, find in document, back and forward between linked files, and pinned and recent files on the home screen
- Reading settings: theme, font, text size, line width, wide tables and distraction-free mode; table columns can be resized and are remembered per file
- Editing in place (Ctrl+E) with a formatting bar and floating bar, editing of tables, links, images, math, Mermaid diagrams and properties, and a Preview of the edits
- Source mode (Ctrl+Shift+M) for the document's Markdown, with line numbers and find and replace
- Saving that rewrites only the blocks you edited and keeps the file's line endings, with autosave, a backup before the first save, Revert to original, and a choice when the file changes on disk
- Settings for where the editing tools go, and keyboard shortcuts that can be changed
- Updates: Octavo checks for a new release when it starts, downloads it in the background and installs it when you restart; What's new shows the changes in each release
