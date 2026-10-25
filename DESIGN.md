# mIDE interface

Operate surface: a quiet workspace for reading and manually writing code. Follow the user's specified Explorer / tabs / editor / status layout.

Use flat neutral surfaces, a single 1px divider between regions, system UI typography and a monospace editor. No animation, gradients, decorative imagery or colorful file icons. Dark is the initial theme; Light shares the same geometry. UI font 13px, editor 14px with 1.65 line height. Explorer is 224px wide with a user-resizable divider, tabs 38px high, status 25px. Visible keyboard focus, legible muted text and accessible tree and tab controls.

Theme tokens cover background, surface, text, muted text, border, selection, cursor and syntax colors. The empty state leads with Open Folder and offers quiet links to Settings, Sources and About mIDE. Menus and destructive/unsaved confirmations are only shown on explicit actions. Errors stay in a compact dismissible strip.

The status bar can start a local static server for the open folder and reload the system browser after a file is written. Its 6px red and green dots are fixed status colors.

Focus Mode keeps file tabs visible for switching documents; it hides the Explorer, menu, status bar and terminal.

Settings is a dedicated full-window page with a clear Back to Editor action. Use flat divided rows for font controls, a live text sample, and the theme library. Keep the current editor and terminal mounted underneath to preserve their state. Adapt controls to a vertical layout in narrow windows.

Highlight the current cursor line and its line number with the theme’s subtle active-line background. Keep selection visually stronger than the active line.

Explorer and tabs share small monochrome file-type silhouettes (selected Devicon SVGs bundled locally). Icons use a single blue accent defined by each theme, with a brighter selected variant in Dark and a darker selected variant in Light. Folders use restrained open/closed outlines, unknown files a generic page. No installed icon font is required.

Theme settings list Dark, Light and the named built-in palettes with imported themes in one library. Each row has four color dots, the name and a Dark or Light label. Search and an All / Light / Dark filter narrow that list. The current theme is a separate row. Follow Omarchy maps the active desktop palette onto these tokens and can use Original, Darker or Contrast surfaces. Import uses the native file chooser. Errors remain inline, preserve the current theme and do not open notifications. Imported JSON contains only validated color overrides. Built-in rows cannot be removed.

About mIDE is a small native modal using the existing dialog style. Show build version, minimal IDE purpose, author, MIT license and a selectable source repository address. Keep the full license collapsed by default and return focus to the editor on dismissal.

Document Find shows a quiet live occurrence count beside the input. Project Find is an explicit, modal text search with a query, one Search action, count and compact path/line/excerpt results. No permanent search sidebar. Escape restores editing, and selecting a result opens that location. Exclusions and incomplete results are explained inline.

Sources is a dedicated full-window page like Settings, available from the workspace menu and the empty state. Keep the editor and terminal mounted beneath it. Use the existing theme tokens, 24px page heading, flat divided source rows and no imagery. A 200px category column with counts sits beside the list; at 720px and below it wraps above the results. Search and Add source sit above All / Favorites / My sources filters. Each row has a small SVG favorite star, linked title, domain, useful description, topic tags and an Actions disclosure. Collection actions contain import, export and Hidden sources. Forms and import confirmation expand inline. Show errors locally, keep failed writes out of committed UI state, and offer an eight-second Undo after deletion. Escape closes disclosures or forms before returning to the editor; restore keyboard focus on return.

Image previews use read-only tabs labeled Preview, flat image canvases with a transparency checkerboard, and a compact path/dimensions/size summary. SVG also offers Open Source. Source image thumbnails occupy a fixed narrow gutter immediately after line numbers, without changing text row heights. Only successfully decoded local images receive a thumbnail. Multiple images share the first thumbnail and a small additional count; their hover panel lists all images. Image and HTML hover panels use the existing surface, foreground and border colors, appear after a short delay, and close on Escape. Settings exposes independent, initially enabled controls for thumbnails, image hover and HTML documentation.

Explorer pointer moves show a compact icon/name preview beside the pointer, dim the source row, and highlight destination folders; dropping onto a file uses its parent, and empty space targets the project root. External drops copy regular files and report skipped items in the existing strips. Context actions include relative/absolute path copying and a keyboard-accessible Move to… folder picker. Existing file and image tabs keep their identity after a move.

The start page keeps Open Folder and the existing quiet links, followed by Recent projects when history exists and no project is open. Show up to ten flat, divided rows with project name, muted full path and a separate remove action. Keep keyboard focus visible, allow long paths to truncate with the full path on hover, and scroll the page in small windows. Opening a recent project follows the same unsaved/terminal checks as Open Folder; missing paths leave the page intact and use the existing error strip.
