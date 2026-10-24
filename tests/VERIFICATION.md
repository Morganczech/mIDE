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
