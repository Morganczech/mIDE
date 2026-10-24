# mIDE

**mIDE** means **minimal IDE**: a quiet desktop editor for learning web programming by writing code manually.

It provides the essentials for editing HTML, CSS, JavaScript, TypeScript, React and Astro. It deliberately leaves out code suggestions, automatic completion, auto-closing tags and brackets, AI assistants and language servers. The goal is to give learners a comfortable place to practice writing and understanding their own code.

Designed for Linux, macOS and Windows. The current version is **0.1.0**; Linux is the primary development and verification platform.

Tauri 2 · Rust · React · TypeScript · Vite · CodeMirror 6

## Run

Install [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/), stable Rust and Node.js 22.12+ (Node 24 LTS recommended).

```sh
npm ci
npm run tauri dev
```

`npm ci` also installs the pinned formatter resources. Rust dependencies are locked in `src-tauri/Cargo.lock`. If install scripts are disabled, run `npm ci --prefix src-tauri/resources/formatter --omit=dev` separately.

On Arch Linux, install the packages listed in Tauri's Arch prerequisites, including `webkit2gtk-4.1`, `base-devel`, `openssl`, `appmenu-gtk-module`, `libappindicator-gtk3`, `librsvg`, `xdotool`, `fontconfig` and `freetype2`. Omarchy uses the ordinary Linux build; no desktop configuration changes are needed. macOS needs Xcode Command Line Tools. Windows needs MSVC C++ Build Tools and WebView2.

## Build

```sh
npm run tauri build
```

Build packages on each target OS. Formatter resources include a native Astro compiler dependency selected for the build host: do not copy `node_modules` between platforms or CPU architectures. Node.js must also be available on the installed application's PATH for Format Document. The editor and terminal do not require Node.js. No Node runtime is embedded.

For a local executable without installers:

```sh
npm run tauri build -- --no-bundle
```

## Use

Open a folder, then click a file in the Explorer. Use the Explorer's plus button to create items at the project root; right-click an item (or Shift+F10) for creation, rename and permanent deletion. Directories load when expanded. Refresh updates the tree after external changes.

The menu provides Open Folder, Save, Find, Format Document, Toggle Terminal, Settings, theme selection and Focus Mode. The current cursor line and its line number are subtly highlighted in both themes. Unsaved files show a small dot. Closing a changed tab, switching projects or closing the window asks whether to save, discard or cancel. Saving a file changed by another program reports a conflict; copy your changes if needed, close/discard the tab, and reopen the file before applying them again. The app never silently overwrites external changes.

| Action | Linux / Windows | macOS |
| --- | --- | --- |
| Open Folder | Ctrl+O | Cmd+O |
| Save | Ctrl+S | Cmd+S |
| Find | Ctrl+F | Cmd+F |
| Format Document | Ctrl+Shift+F | Cmd+Shift+F |
| Toggle Terminal | Ctrl+J | Cmd+J |
| Close Tab | Ctrl+W | Cmd+W |
| Next Tab | Ctrl+Tab | Cmd+Tab |
| Increase editor text | Ctrl++ (or Ctrl+=) | Cmd++ (or Cmd+=) |
| Decrease editor text | Ctrl+− | Cmd+− |
| Reset editor text | Ctrl+0 | Cmd+0 |
| Focus Mode | Ctrl+Shift+Enter | Cmd+Shift+Enter |
| Exit Focus Mode | Esc | Esc |
| Keyboard Shortcuts | F1 | F1 |
| Settings | Ctrl+, | Cmd+, |

Open **Menu → Keyboard Shortcuts** (or press **F1**) to see the shortcut reference. Menu actions also show their shortcuts. Focus Mode briefly displays its exit shortcut; **Esc** exits Focus Mode when no Find panel or dialog is open. Focus Mode keeps file tabs visible and hides the Explorer, menu, status bar and terminal. It restores the previous terminal visibility when exited. The terminal starts lazily in the project root. Drag the terminal’s top edge upward to enlarge it or downward to shrink it. The terminal automatically adjusts its rows and columns; enough room remains for the editor. You can also focus the divider with Tab and use the Up/Down arrows. Its height is retained while hidden. Hiding it keeps its shell running. A project switch stops its processes after confirmation. On Unix it uses the account's configured shell (then `$SHELL`, then `/bin/sh`); Windows uses `%COMSPEC%` or `cmd.exe`. Your own shell configuration, including any shell suggestions, remains yours. If the shell exits, hide/reopen alone preserves that ended session; reopen the project to start a fresh session.

HTML, CSS, JavaScript, TypeScript, JSX, TSX, Astro, JSON and Markdown have syntax highlighting. Other UTF-8 files open as plain text. Files over 16 MiB, binary files and invalid UTF-8 are rejected. UTF-8 BOM and LF/CRLF are preserved. Names and paths support Unicode. Paths through symlinks outside the selected project cannot be opened or edited; deleting a link deletes the link itself.

Formatting is explicit, uses the shipped pinned Prettier and Astro plugin, makes one undoable edit and does not save. Project Prettier configs/plugins are intentionally not executed. No format-on-save or autosave. Theme, interface/editor font families and editor text size (10–32px, default 14px) are persisted preferences; project and open-file sessions are not restored.

There is no AI, autocomplete, LSP, diagnostics, auto-closing tags/brackets, debugger, Git UI, documentation viewer, telemetry, account or extension system. Git runs in the terminal. Documentation belongs in your browser.

## Appearance settings

Open **Menu → Settings** or press **Ctrl+,** (**Cmd+,** on macOS). Settings is also available before opening a project. Return using **Back to Editor** or **Esc**. Open files, undo history, Focus Mode and the running terminal are preserved.

Choose the interface font separately from the monospace editor/terminal font. The font selectors list installed system font families; the editor/terminal selector includes only monospace families. Discovery uses Fontconfig on Linux, Core Text on macOS and DirectWrite on Windows, and runs in the background when Settings opens. Reopen Settings after installing new fonts. Default and generic system fonts remain available, and **Custom font…** allows entering a family name manually. Missing font families fall back to the default. If font discovery fails, manual selection still works. On Debian/Ubuntu, building font discovery requires `libfontconfig1-dev` and `libfreetype6-dev`. Font files are not downloaded or installed by mIDE.

The editor size control and its keyboard shortcuts stay synchronized. Dark and Light themes have previews and apply immediately to the whole app. Preferences are saved locally without an Apply button. The live code preview shows the selected editor font and size. Importing custom themes is not part of this first settings screen.

## Checks

```sh
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

Formatter tests spawn Node. PTY tests spawn the system shell. Environments that forbid child processes cannot run these integration checks faithfully. CI builds on Linux, macOS and Windows; native interactive verification is still required on each OS.

For an opt-in native Linux smoke test, see [tests/VERIFICATION.md](tests/VERIFICATION.md). The `smoke-test` feature and `VITE_NATIVE_SMOKE=1` build flag are test-only; ordinary builds contain neither the injected test script nor the editor test hook.

## License

mIDE is released under the [MIT License](LICENSE). Third-party dependencies retain their respective licenses. The bundled file icons are selected Devicon SVGs; their MIT notice is included in [public/licenses/devicon.txt](public/licenses/devicon.txt).
