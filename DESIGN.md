# mIDE interface

Operate surface: a quiet workspace for reading and manually writing code. Follow the user's specified Explorer / tabs / editor / status layout.

Use flat neutral surfaces, a single 1px divider between regions, system UI typography and a monospace editor. No animation, gradients, decorative imagery or colorful file icons. Dark is the initial theme; Light shares the same geometry. UI font 13px, editor 14px with 1.65 line height. Explorer is 224px wide with a user-resizable divider, tabs 38px high, status 25px. Visible keyboard focus, legible muted text and accessible tree and tab controls.

Theme tokens cover background, surface, text, muted text, border, selection, cursor and syntax colors. Empty state contains only Open Folder. Menus and destructive/unsaved confirmations are only shown on explicit actions. Errors stay in a compact dismissible strip.

Focus Mode keeps file tabs visible for switching documents; it hides the Explorer, menu, status bar and terminal.

Settings is a dedicated full-window page with a clear Back to Editor action. Use flat divided rows for font controls, a live text sample and two theme preview choices. Keep the current editor and terminal mounted underneath to preserve their state. Adapt controls to a vertical layout in narrow windows.

Highlight the current cursor line and its line number with the theme’s subtle active-line background. Keep selection visually stronger than the active line.

Explorer and tabs share small monochrome file-type silhouettes (selected Devicon SVGs bundled locally). Icons use a single blue accent defined by each theme, with a brighter selected variant in Dark and a darker selected variant in Light. Folders use restrained open/closed outlines, unknown files a generic page. No installed icon font is required.

Theme settings retain the built-in previews and list imported themes as quiet radio rows with a small palette swatch and Remove action. Import uses the native file chooser. Errors remain inline, preserve the current theme and do not open notifications. Imported JSON contains only validated color overrides over Dark or Light.

About mIDE is a small native modal using the existing dialog style. Show build version, minimal IDE purpose, author, MIT license and a selectable source repository address. Keep the full license collapsed by default and return focus to the editor on dismissal.

Document Find shows a quiet live occurrence count beside the input. Project Find is an explicit, modal text search with a query, one Search action, count and compact path/line/excerpt results. No permanent search sidebar. Escape restores editing, and selecting a result opens that location. Exclusions and incomplete results are explained inline.
