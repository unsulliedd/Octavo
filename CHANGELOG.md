# Changelog

All notable changes to Octavo. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version adds features and a patch version fixes bugs.

## [Unreleased]

### Added
- Workspaces: Open folder… on Home and in the sidebar's new Files tab lists a folder's Markdown documents as a tree and opens them with a click. Home shows recent workspaces, the status bar and the Files tab switch between them, the open workspace comes back after a restart, and the tree refreshes when the window gets focus or with Refresh. Settings › Reading › Show hidden folders includes folders whose names start with a dot. With no workspace open, the Files tab offers the document's folder; opening it brings the shown document along as a tab
- Each workspace keeps its own tabs: switching or closing a workspace puts its tabs away and brings back the next one's, with the shown tab, each tab's history and Reopen closed tab, and with no workspace open Octavo keeps its own tabs. Unsaved edits are saved first, or with autosave off Octavo asks, and Cancel stays where you are. The tabs come back after a restart
- Quick open (Ctrl+P) searches the open workspace by folder and file name: `audit econ` finds `audit/economy.md`. Up and Down move through the results, Enter or a click opens one and Escape closes the box. It can be given other keys in Settings › Shortcuts
- Right-clicking a folder or document in the Files tab removes it from the workspace, with nothing changed on disk, and a Removed list brings it back. The + button next to Refresh adds another folder or document. An added document that is renamed or moved outside Octavo shows as not found, with Remove. Pins move into a fixed Pinned workspace that Home still shows and that opens like any other, and a saved workspace can be removed from Home
- Workspaces of your own: New workspace… in the workspace menu of the Files tab and the status bar asks for a name and opens the new, empty workspace, whose Files tab says how to fill it. The menus of documents and folders in the Files tab, of tabs and of Home's documents have Add to ›, which puts the item in Pinned, in a workspace of your own or in a new one named on the spot, and stays in the open workspace; a workspace that holds the item already, by itself or through its folder, is ticked. Right or Enter opens Add to ›, and Left or Escape closes it. A folder's workspace isn't offered there and only changes through its own Files tab. Rename… in the menu of Home's workspaces renames any workspace but Pinned; a folder's workspace keeps its folder. In Pinned and your own workspaces, a folder shows as a folder tree and a document added by itself is listed at the top
- The sidebar can be resized by dragging its edge or with the arrow keys on it; a double-click goes back to the usual width. The width is kept between launches
- The outline can sit beside the text instead of in the sidebar: a new setting in the reading settings, Outline location, puts it on the Right or the Left, where a column of dashes, one per heading, stands in the margin beside the text. Hovering the dashes floats the outline over the document, clicking a dash goes to its heading, and the keyboard reaches it through one button. Show outline in the reading settings now turns the outline off everywhere, and Files can be shown and hidden with `Ctrl+\`, which can be changed in Settings
- A workspace on Home can have a picture of your own as its cover: Choose image… in the card's menu copies a PNG, JPEG, GIF, WebP, SVG, BMP or AVIF image into Octavo's settings folder and shows it on the card, and Remove image goes back to the default cover. Removing the workspace deletes its copy, and a cover whose file is gone shows the default cover. Pinned keeps its default cover
- Settings › Colors sets the primary, secondary and accent colors that the app's colors are drawn from, for both themes: each with the system color picker or a hex value such as #1f5fad, with Reset for each and Reset all colors, and a preview of the sidebar and a document. Text drawn from these colors is lightened or darkened where needed so it stays readable, and text on a button turns dark when the button's color is light. The theme can be picked there too
- Settings › Colors also changes each of the app's colors by itself, in groups for the window, the document, links and focus, selection and find, controls, warnings, code blocks, inline code, and tooltips and scrollbars, which Jump to moves between. Colors for picks the Light or the Dark set, each kept on its own, and the preview and the code samples show that set. A color that follows another, such as From primary, shows the color it has now until it is changed. Reset group resets the colors of a group, and Reset all colors now resets both sets too. A changed color that is hard to read on its background, or a changed background that makes other text hard to read, shows a warning under its row without stopping the change. A chosen scrollbar color is solid
- Settings › Colors can save the colors as a theme file and bring them back: Export theme… asks for a name and writes the changed base colors and both sets to a `.octavo-theme.json` file, and Import theme… opens one, asks before replacing colors you changed, and says what it brought, such as 3 base colors, 24 light, 22 dark. A file that isn't an Octavo theme, is from a newer Octavo or is larger than 64 KB leaves the colors as they are and says why. Only known colors with valid values are read from a file
- Settings › Shortcuts has a Find a shortcut field at the top of the list that finds actions by name or by keys, such as Ctrl+K, says how many match and hides the groups with none. While it has text, Escape clears it before it closes Settings
- When two actions share keys, both rows in Settings › Shortcuts say which action also uses them, with Remove from … to take the keys off that action
- Reset group in each group of Settings › Shortcuts puts that group's shortcuts back; it shows once something in the group is changed

### Changed
- Controls use the primary color in the dark theme too, lifted so it reads on dark, instead of the secondary color: checkboxes, sliders, focused fields, Done and the update button's edge, the unsaved-edits dot and the headings in Source mode
- Selected rows look the same everywhere: the highlighted Ctrl+P result, the current language in the code-language list and pressed formatting buttons use the soft primary color, like the outline, the Files tree and Settings
- Scrollbars are a thin thumb with no track that widens under the pointer, in both themes, in every part of the window that scrolls
- The outline's dashes beside the text are a shade darker, so they are easier to see in both themes
- Buttons share a few set heights and the same corners, and text fields look alike everywhere: the find bar, Ctrl+P, the link, image and math fields, properties, the code-language search and the shortcut recorder have a border that is easy to see and the same border when they have the focus
- Moving through the app with the keyboard shows one focus ring everywhere, now also on menu items and the highlighted language in the code-language list; a mouse click shows none
- Documents have their own icon: the page with its folded corner in the primary color, lifted on the dark theme, in the Files tab, tabs, Home, Ctrl+P and the list of open tabs, which now shows it too. A document that is not found keeps its icon gray
- Icons have one size for each use: buttons and the document and folder icons of rows are 16 px, icons beside text and the arrows of lists 14 px, and the icons of Home's rows 18 px
- Checkboxes in Settings, the reading settings and task lists are drawn in the app's colors instead of the system's gray box, in both themes; ticked boxes use the primary color. Task boxes in the reading view show at full strength
- Tooltips are the app's own, in its colors, with the keys of a shortcut set apart. They show after a short hover or when the keyboard reaches a control, stay inside the window and close with Escape. Paths in the Files tab, tabs, Home and Ctrl+P still show in full. Buttons that show only an icon, such as Home, Back, Find and Settings, show their name as a tooltip too
- Ctrl+P dims the window behind it, like Settings and the large view, which now share one shade
- Questions and messages are the app's own dialogs instead of the system's message boxes, in the app's colors and both themes: saving before closing a tab, the window or a workspace, Revert, removing a workspace, discarding a diagram's changes and errors such as a missing licenses document. The first button has the focus, Enter picks the focused button, Escape or a click beside the dialog cancels, and the app's shortcuts wait until it closes. Answers that lose something, such as Don't save, Discard, Revert and Remove, are marked in red

- Inline code stands out from the text around it in the reading view and the editor: accent-colored text on a tinted chip in both themes, a deeper shade on the light theme. Inside a link it keeps the link's color
- Home uses the width of the window and shows workspaces as square cards that reflow with it: a + card that makes a new workspace and opens it, then Pinned, then the other workspaces, most recent first. Each card has a cover drawn from the primary, secondary and accent colors that stays the same through a rename, the name, and a line with a folder, stack or pin mark and the folder or what the workspace holds; the open workspace is marked. A click opens the workspace, and a right-click, the ⋯ button, the context-menu key or Shift+F10 opens Open, Rename…, Open folder in Explorer and Remove workspace; Pinned has Open only
- Open file… and Open folder… sit at the top right of Home, and Recent documents list in columns below the cards, pinned ones included with their pin pressed; Pinned's documents no longer list on Home of their own. The drop box shows on the first launch only, and dropping a file anywhere in the window still opens it
- Settings: each section in the list has an icon, and the foot of the list shows the version, the update status and Check for updates. In a narrower window the list is a column of icons that name their section in a tooltip. Up and Down move between the sections, and Home and End go to the first and the last
- Settings › Shortcuts shows each key as a key cap, lined up in one column, with a second shortcut after "or"; changed shortcuts use the selected-row colors and an action without keys says None. The keys that can't be changed are listed as the last group, and recording one of them is refused with the reason under the row instead of being marked as a conflict
### Fixed
- Compare, Done in the image, math and Mermaid editors, and Restart for an update are readable in the dark theme: they had white text on a light blue
- Small primary buttons, such as Compare, Done and Restart, keep their color under the pointer instead of turning gray
- Links in the light theme are a shade darker, so they are readable on the sidebar and toolbar
- The window's background follows the dark theme instead of staying light
- Right-clicking a document on Home opens a menu with Open, Open containing folder, Copy path, Add to › and Pin or Unpin; right-clicking a workspace opens Open, Open folder in Explorer (for a workspace of a folder), Rename… and Remove workspace. The context-menu key or Shift+F10 on a focused row opens it too
- Right-clicking Home or any other part of the window no longer shows the browser's own menu (Back, Refresh, Save as, Print); it stays in text fields, the editor and Source mode, for Cut, Copy, Paste and spelling suggestions
- Tables in the large view open at the column widths they have in the document, and their columns can be dragged and double-clicked like in the reading view; the change is the same remembered width
- Edits to a document that no tab shows any more, left by going Back or Forward in a tab, are saved to its file like any others; if the file changed on disk meanwhile, nothing is overwritten and the save reports it
- A document with struck-through bold text (`~~**text**~~`) opens in the editor instead of Source mode: the editor writes it as `**~~text~~**`, which looks the same
- With many documents open, tabs shrink to fit instead of running off the end of the toolbar, the mouse wheel scrolls the tab strip sideways, and a button at the end of the strip lists every open tab when they still don't fit

## [0.6.1] - 2026-11-01

### Fixed
- Open-source licenses in Settings › About opens the list instead of saying this build doesn't have it

## [0.6.0] - 2026-11-01

### Added
- Settings › About has Open-source licenses: the licenses of the libraries and fonts Octavo is built from, opened in a tab. Every build writes the document from what it actually contains and stops if a package has no license or one that is not on the allowed list
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
- Images embedded in the document (`data:image/png`, jpeg, gif and webp) show in the reading view; other embedded types, such as SVG, stay blocked
- A click on a link in a diagram follows the link instead of opening the diagram large
- Images in a table no longer show an open button in the large copy of the table, where it did nothing
- The status bar shows a file's real line endings: CR for old Mac files, and the most common kind with "(mixed)" for files that mix them
- Images with an absolute drive path (`C:/pics/a.png` or `C:\pics.png`) show in Markdown and in `<img>`
- A `<picture>` shows its `<source>` variants, such as a dark-mode image, when images open large; the large view still opens
- `<source srcset>` images next to the document load, with their width or density descriptors; one on another network server stays blocked
- A link in a Mermaid diagram opens in the browser, and the window refuses to navigate away from Octavo, so a link can no longer replace the document and lose unsaved edits
- Documents on a network share show their images: relative ones, images added to the document, and absolute network paths on the document's own server. A network image on another server shows as missing, because loading it would send your network credentials to that server
- When the editor refuses to save an edit, the save status says what to do next instead of offering a retry that can't work
- Octavo reads an image from disk only if it's in an open document's folder or is an image file a document refers to. Any other path sent to Octavo's image address shows as a missing image
- Links in a table or diagram open large work as they do in the document: web links go to the browser, documents open here, and a link to a heading closes the large view and scrolls there. Tab reaches them
- A file with mixed line endings or carriage-return line endings keeps them when saved: only the edited lines change
- A file that isn't UTF-8 text, such as UTF-16 or a binary file named `.md`, shows a message saying so instead of a technical error or unreadable text
- A document nested too deeply to show says so, and a document that takes too long to render stops with a message instead of showing Opening forever

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
