# Changelog

All notable changes to Octavo. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version adds features and a patch version fixes bugs.

## [Unreleased]

### Added
- Diagrams, images and tables open large over the window from the reading view. Diagrams and images zoom and can be dragged to move; a table gets the window's width. Tables open from a button at their top right; diagrams and images from the same button, a click on them, or both, as Settings › Reading › Open diagrams and images large says (both at first). An image inside a link still follows the link when clicked. Escape or a click outside closes the large view
- Settings has a Reading section, first in the list, for reading options beyond the quick ones in Reading settings
- Settings has an About section: Octavo's version, What's new, links to the release notes, the source code and a new problem report on GitHub, and the license
- Right-clicking a tab opens a menu: Open containing folder (in Explorer, with the file selected), Copy path, Close, Close others, Close tabs to the right and Reopen closed tab. Closing several tabs asks about unsaved edits one tab at a time, and Cancel keeps the rest open
- Tabs can be dragged to a new place in the tab strip; the others make room as the dragged tab passes them, Escape puts it back, and the order is kept for the next launch
- Reopen closed tab (Ctrl+Shift+T) brings back the last closed tab where it was, with its back and forward history and scroll position; pressing it again goes further back. It can be given other keys in Settings › Shortcuts
- Octavo opens at the size and position its window had when it was closed, maximized again if it was; a window that would land on a monitor that's no longer connected opens centered instead

### Changed
- The update settings (Check for updates when Octavo starts, Check now and Restart now) are at the bottom of About; the Updates section is gone

### Fixed
- Documents on a network share show their images: relative ones, images added to the document, and absolute network paths on the document's own server. A network image on another server shows as missing, because loading it would send your network credentials to that server
- When the editor refuses to save an edit, the save status says what to do next instead of offering a retry that can't work

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
