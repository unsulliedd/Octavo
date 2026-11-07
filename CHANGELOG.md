# Changelog

All notable changes to Octavo. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version adds features and a patch version fixes bugs.

## [Unreleased]

## [0.5.0] - 2026-11-07

The first release of Octavo, a Markdown reader and editor for Windows. Free and open source under the MIT license.

### Added
- Reading view: GitHub Flavored Markdown with tables, task lists and footnotes, math, Mermaid diagrams, images, sanitized HTML and highlighted code with a Copy button; frontmatter shows as properties. Diagrams, images and tables open large over the window, where diagrams and images zoom and can be dragged
- An outline that follows your place, in the sidebar or beside the text on the left or the right; find in document; back and forward between linked files; and a right-click menu with Copy, Select all and the addresses of links and images
- Reading settings: theme, font, text size, line width, wide tables and distraction-free mode; table columns can be resized and are remembered per file
- Editing in place (Ctrl+E) with a formatting bar and floating bar, editing of tables, links, images, math, Mermaid diagrams and properties, and a Preview of the edits
- Source mode (Ctrl+Shift+M) for the document's Markdown, with line numbers and find and replace
- Saving that rewrites only the blocks you edited and keeps the file's line endings, with autosave, a backup before the first save, Revert to original, and a choice with Compare when the file changes on disk
- Tabs that come back on the next launch, can be dragged into a new order, shrink to fit, have a right-click menu and a list of every open tab, and Reopen closed tab (Ctrl+Shift+T)
- Workspaces: a folder's documents as a tree in the Files tab, Pinned documents, and workspaces of your own; each workspace keeps its own tabs, and Quick open (Ctrl+P) finds its documents by name
- Home: workspaces as cards, with covers drawn from the app's colors or a picture of your own, Open file… and Open folder…, and recent documents
- Settings › Colors sets the primary, secondary and accent colors and each of the app's colors for the light and the dark theme, warns when text becomes hard to read, and exports and imports `.octavo-theme.json` theme files
- Settings › Shortcuts: every shortcut can be changed, searched and reset, and keys shared by two actions are shown with a way to fix it
- The app's own dialogs, tooltips, checkboxes and scrollbars in both themes, one keyboard focus ring everywhere, and support for Windows high-contrast mode
- Octavo opens at the window size and position it had when it was closed, keeps its data in `%APPDATA%\Octavo`, and lists the open-source licenses it is built from in Settings › About
- Updates: Octavo checks for a new release when it starts, downloads it in the background and installs it when you restart; What's new shows the changes in each release
