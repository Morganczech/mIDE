# Verification

## Automated checks

- Editor fixtures: every supported language; Astro frontmatter, components, expressions, JS and CSS; independent undo history; dirty state; CRLF. Native checks verify that active-line and line-number highlighting follows the cursor in Dark/Light without changing the document. Native regression checks compare every visible line number with its text row at default, enlarged and maximum font sizes, and after switching tabs.
- Formatter: every supported language, idempotence, CRLF, invalid syntax and unsupported extension.
- Rust: project boundary and symlink escape rejection; UTF-8, binary rejection, BOM and CRLF; conflict detection; real PTY input/output and resize.

## Native smoke test

The test runs in an actual Tauri WebKitGTK window. It opens only a temporary fixture project, exercises React and CodeMirror, calls real Rust filesystem and formatter commands and starts a real system shell. It also checks the shortcut reference, F1 access from Focus Mode, the exit hint and Escape recovery. Terminal checks cover top-edge pointer drag, keyboard resizing, height limits, row fitting, actual PTY dimensions and height retention across hide/show. Appearance checks cover actual native font discovery, monospace-only filtering, installed-font selection and restoration, Settings navigation, live font and theme changes, names with spaces, persisted preferences, line alignment and preservation of the document, shell and terminal height. Its test injection is excluded from normal builds.

Create `/tmp/mide-smoke-project/index.astro` containing valid Astro with the word `Hello`, and `other.ts` containing `const count: number = 1;`.

```sh
VITE_NATIVE_SMOKE=1 npm run tauri build -- --no-bundle --debug --features smoke-test
MIDE_SMOKE_PROJECT=/tmp/mide-smoke-project MIDE_SMOKE_THEME=/tmp/mide-smoke-project/smoke-theme.json src-tauri/target/debug/mide
cat /tmp/mide-native-report.txt
```

An active graphical session is required. Optional `MIDE_SMOKE_KEEP_OPEN=1` leaves the test window available for visual inspection. Always rebuild normally before distributing; never distribute smoke binaries.

## Manual platform checklist

On Linux/Wayland, macOS and Windows, verify the native folder picker, mouse and keyboard selection, copy/paste, undo/redo, IME composition, Czech/Unicode text, keyboard layout shortcuts, file CRUD, unsaved prompts on window close, readonly-file errors, external edits, terminal Ctrl+C, resizing, sustained build output, process cleanup and both themes. Check the smallest supported window (600×400) as well as a normal desktop window. Native OS-specific IME/clipboard checks cannot be replaced by DOM simulation.

## Current local evidence

Linux frontend and native builds, unit/integration tests, Clippy and an injected native UI smoke pass (including format undo, filesystem CRUD, terminal Unicode output and Ctrl+C) were run during implementation. Visual inspection covered the empty state and the editor with Light theme and terminal. macOS and Windows are represented in CI configuration but were not run locally. Native IME/clipboard behavior on all three systems still requires hands-on validation.

File icons: native WebKit smoke verifies Astro silhouettes in Explorer and tabs and theme-dependent monochrome color. Selected Devicon SVGs are bundled, with license distributed under licenses/devicon.txt.

Theme imports: native smoke reads a real UTF-8 JSON fixture via Rust (only the chooser is bypassed by a smoke-only environment variable), verifies application/terminal colors, persistence, invalid JSON preservation and removal. Parser tests also cover sparse themes, unsafe colors, unsupported fields/versions, size limits and damaged persisted data.

About: native smoke checks version/author/purpose, source address and full MIT license, ignores application shortcuts while modal, and verifies Escape and Close restore editing without changing the document.

Search: Rust tests verify Unicode UTF-16 columns, literal case-insensitive matching, result limits, unsaved overlays, skipped binaries/dependencies and symlinks. Native smoke checks live document counts (including zero and edits), project shortcut/menu, cross-file count, unsaved content and exact selected match navigation.

MDX: a mixed fixture covers frontmatter, ESM, expressions, nested JSX/components/fragments, Markdown markup and web code fences. Tests check syntax tokens, edits/unfinished JSX and absence of completion data. Native smoke checks lazy loading in WebKitGTK, actual colored tokens, theme changes and the file icon.

## Explorer and image upgrade checks

`tests/previews.test.ts` checks source-relative/root-relative image resolution, project escapes, HTML/Astro/JSX/TSX/MDX syntax, comments, fenced/inline code, dynamic expressions, favicons, multiple images and edits. `tests/image-loading.test.ts` checks shared loads, bounded concurrency/cache, refresh invalidation and retries. Rust filesystem tests cover moves, collisions, regular-file imports, unchanged sources, symlink boundaries and image size limits.

For a browser integration pass, start `npm run dev`, then run `node scripts/upgrade-smoke.cjs` with Playwright available. `PLAYWRIGHT_MODULE` may point at an existing Playwright installation, and `MIDE_TEST_BROWSER` may point at Chromium. The script uses mocked Tauri commands; it checks pointer moves, unsaved buffer preservation, native drop coordinates at 150% scale, image/source tabs, tooltip links, independent preferences, gutter alignment, Dark/Light and a 600×400 window. Screenshots are written to `/tmp/mide-upgrade-*.png`. This does not replace OS drag-and-drop testing.

For the real native upgrade test, create a fresh `/tmp/mide-upgrade-project` containing any text file and a small SVG at `/tmp/mide-upgrade-external.svg`. Build with `VITE_NATIVE_SMOKE=1 npm run tauri build -- --no-bundle --debug --features smoke-test`, then run:

```sh
MIDE_SMOKE_UPGRADE=1 MIDE_SMOKE_PROJECT=/tmp/mide-upgrade-project src-tauri/target/debug/mide
cat /tmp/mide-native-report.txt
```

The test writes only its temporary project, verifies WebKit image decoding, gutter alignment/counts, image/source tabs, native clipboard writes, moves with unsaved text, preferences and real batch imports. Use a fresh fixture directory for every run. Manually verify OS file-manager drops and clipboard behavior on Linux, macOS and Windows before release.

Local upgrade verification (2026-10-25): 111 frontend tests and 37 Rust tests passed. Clippy passed with all targets/features and warnings denied; Rust formatting and TypeScript checks passed. The browser integration scenario passed with Dark/Light, 150% display scale and the smallest supported window. All 12 native upgrade checks passed in Linux WebKitGTK, including real clipboard writes and batch imports. A normal desktop build was restored after the smoke run. Native file-manager drag delivery and macOS/Windows still require manual platform verification.

Explorer drag regression: rows explicitly capture the pressed pointer, prevent native drag/selection, and release capture on drop/cancellation. Browser smoke asserts capture and cancelled `dragstart`, in addition to the resulting move. `scripts/native-drag-smoke.js` can be selected with `MIDE_SMOKE_DRAG=1 MIDE_SMOKE_KEEP_OPEN=1` in a smoke build. Give it a fresh fixture containing `drag.txt`, `destination/` and `folder/child.txt`; drag the file, then the folder, into destination. The report in `/tmp/mide-native-report.txt` records phases and pointer events, ending in `done` after verifying both filesystem moves. Actual X11 mouse input passed both moves in Linux WebKitGTK at devicePixelRatio 2 during the fix. This exercises dragging directly rather than the Move to… menu.

Recent projects: parser/order tests cover deduplication, ten-entry retention, updated names, Unicode, Windows/UNC paths and damaged local storage. Browser integration checks persistence after reload, direct opening without a chooser, removal persistence and a missing folder leaving the start page intact. Rust checks existing Unicode/spaced directories, missing paths and file paths. Local verification passed 116 frontend tests, 38 Rust tests, TypeScript, all-feature Clippy and the browser scenario.

CSS help and troubleshooting: `tests/css-help.test.ts` checks CSS declaration matching, inline-style offsets, HTML/Astro blocks, selectors/comments/JS exclusions, nested rules, offline examples and guide searching. Browser smoke checks CSS hover/MDN links, immediate independent CSS toggling, searchable guides, disclosure Escape handling, returning to source collections and narrow/large layouts. Local frontend suite passed 125 tests. Screenshots: `/tmp/mide-css-help.png`, `/tmp/mide-troubleshooting.png` and `/tmp/mide-troubleshooting-small.png`.
