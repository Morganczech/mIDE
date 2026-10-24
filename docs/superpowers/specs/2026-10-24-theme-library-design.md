# Theme library and Follow Omarchy

## Goal

Settings → Theme becomes a built-in theme library with search, a Light/Dark filter, and a current-theme row. A Follow Omarchy switch maps the active desktop theme onto the existing mIDE color tokens and updates when that theme changes.

Dark and Light stay the built-in defaults. Imported JSON themes stay in the same library and can still be removed.

## Catalog

Ship these files under `themes/`. Each file is a version 1 theme and sets every key in `colorKeys`. `themes/quiet-blue.json` stays an import example and is not part of the library.

| File | Name | Variant |
| --- | --- | --- |
| `dracula.json` | Dracula | dark |
| `one-dark.json` | One Dark | dark |
| `nord.json` | Nord | dark |
| `monokai.json` | Monokai | dark |
| `material-ocean.json` | Material Ocean | dark |
| `one-light.json` | One Light | light |
| `github-light.json` | GitHub Light | light |
| `solarized-light.json` | Solarized Light | light |
| `material-lighter.json` | Material Lighter | light |

Colors come from the public Dracula, Atom One Dark, Atom One Light, Nord, classic Monokai, Material Theme Ocean, Material Theme Lighter, GitHub Light, and Solarized Light palettes. Assign those colors only to existing mIDE tokens. Add no new tokens and no extra JSON fields. The theme parser rejects unknown fields, so source notes stay out of the JSON.

A built-in id is `builtin:` plus the file stem, for example `builtin:nord`. Stored values `dark` and `light` keep their current meaning. An import named like a built-in theme is a separate `custom:…` row. Built-in rows have no Remove action.

Dark and Light colors remain the CSS defaults in `:root` and `:root[data-theme="light"]`. Choosing either clears inline color overrides, as it does today. Every other built-in sets `data-theme` to its `variant` and writes all of its colors as inline custom properties.

The frontend loads the catalog with `import.meta.glob` and excludes `quiet-blue.json`.

## Follow Omarchy

Two preferences:

- `mide-follow-omarchy` is `"1"` when following and absent otherwise. Default is off, so an existing `mide-theme` is unchanged.
- `mide-omarchy-variant` is `original`, `darker`, or `contrast`. Default is `original`. The control is disabled while following is off, and the stored value is kept.

While following is on, `mide-theme` is not overwritten. Turning following off restores that saved theme. Choosing any library row turns following off and stores that row's id.

### Reading the desktop theme

Rust reads the slug from `$HOME/.local/state/omarchy/current/theme.name`. The slug must match `^[a-z0-9][a-z0-9-]*$`. Anything else is an error. This rejects path traversal.

If `$HOME/.config/omarchy/themes/<slug>/colors.toml` exists, that file is the whole palette. Otherwise Rust reads `/usr/share/omarchy/themes/<slug>/colors.toml`. A user file replaces the stock file; keys are not merged. A missing `HOME`, a missing name file, a missing palette, or an unreadable file is the unavailable error.

The parser accepts only flat `key = "value"` lines, blank lines, and `#` comments. Values are six-digit `#RRGGBB`, except `mode`, which is `dark` or `light`. The file is capped at 64 KiB. These keys are required: `mode`, `accent`, `selection`, `muted`, `background`, `dark_background`, `darker_background`, `lighter_background`, `foreground`, `dark_foreground`, `light_foreground`, `bright_foreground`, `red`, `yellow`, `orange`, `green`, `cyan`, `blue`, `magenta`, `bright_red`, `bright_yellow`, `bright_green`, `bright_cyan`, `bright_blue`, `bright_magenta`. Other keys are ignored. A missing required key, a bad color, or a bad `mode` is a parse error.

The display name splits the slug on `-`, capitalizes the first letter of each word, and joins the words with spaces. `tokyo-night` becomes `Tokyo Night`.

`read_omarchy_theme` returns the slug, display name, mode, and raw color map. Path joins and parsing are pure functions that take a home directory and a stock root, so tests do not touch the real home directory.

### Watching

The `notify` crate watches the directory that contains `theme.name`, non-recursively. Events are debounced by 200ms and emitted as `omarchy-theme-changed` with no payload. `watch_omarchy_theme` is idempotent. If the directory is missing, it returns the unavailable error and does not retry. The frontend starts the watch on launch when following is on, and again when the user turns following on.

### Mapping

TypeScript maps the raw palette and the selected variant into a complete theme. `data-theme` follows `mode`. The same mapping is used for every Omarchy theme, including one whose name matches a built-in palette.

Surfaces:

- Original: `bg` is `background`, `surface` is `lighter_background`, and `raised` is each `lighter_background` channel mixed with 15% of the same channel from `foreground` (`round(surface * 0.85 + foreground * 0.15)`).
- Darker: `bg` is `darker_background`, `surface` is `dark_background`, and `raised` is `background`.
- Contrast: surfaces match Original, including the same `raised` mix against `foreground`. `fg` is `bright_foreground`. The UI `muted` token is `light_foreground`.

Shared tokens:

| Token | Source |
| --- | --- |
| `fg` | `foreground`, or `bright_foreground` in Contrast |
| `muted` | `dark_foreground`, or `light_foreground` in Contrast |
| `border` | Omarchy `muted` |
| `selection` | `selection` |
| `active-line` | `dark_background` |
| `cursor` | `bright_foreground` |
| `focus` | `accent` |
| `file-icon` | `blue` |
| `file-icon-active` | `bright_blue` when `mode` is dark, otherwise `accent` |
| `syntax-keyword` | `magenta` |
| `syntax-string` | `green` |
| `syntax-number` | `orange` |
| `syntax-comment` | `dark_foreground` |
| `syntax-type` | `yellow` |
| `syntax-property` | `cyan` |
| `terminal-black` | `dark_background` |
| `terminal-red` | `red` |
| `terminal-green` | `green` |
| `terminal-yellow` | `yellow` |
| `terminal-blue` | `blue` |
| `terminal-magenta` | `magenta` |
| `terminal-cyan` | `cyan` |
| `terminal-white` | `foreground` |
| `terminal-bright-black` | Omarchy `muted` |
| `terminal-bright-red` | `bright_red` |
| `terminal-bright-green` | `bright_green` |
| `terminal-bright-yellow` | `bright_yellow` |
| `terminal-bright-blue` | `bright_blue` |
| `terminal-bright-magenta` | `bright_magenta` |
| `terminal-bright-cyan` | `bright_cyan` |
| `terminal-bright-white` | `bright_foreground` |

Contrast does not change terminal ANSI colors or syntax comments. Syntax comments stay `dark_foreground` even when the UI muted color changes.

On launch, apply the stored manual theme immediately. If following is on, replace it when the Omarchy read returns. A single flash of the manual theme is acceptable.

Changing the variant or turning following on reads the palette again. `omarchy-theme-changed` also reads again, but only while following is on; events while following is off do not change colors. The last successfully mapped theme stays applied if a later read fails. Following stays on.

## Settings

The Theme section uses the existing flat settings rows, 13px UI type, and 1px dividers. It does not copy Strata's chrome.

1. Follow Omarchy, with a one-line description and a `role="switch"` toggle.
2. Omarchy variant, with a one-line description and a select of Original, Darker, and Contrast. Disabled while following is off.
3. Current theme: four dots and the active name. The dots are background, red, green, and blue. While following, the name is the Omarchy display name and the dots use the mapped theme. Otherwise the name is Dark, Light, the built-in name, or the imported name.
4. Theme library: a search field labeled for assistive tech, and an All / Light / Dark filter. The filter default is All and is not stored.
5. One radio list containing Dark, Light, the nine JSON themes, and imported themes. A row shows four dots, the name, and a Dark or Light label. Imported rows keep Remove. An empty result is the sentence "No matching themes."
6. Import Theme… stays under the list. Import behavior is unchanged.

Search is a case-insensitive substring of the display name. The variant filter applies at the same time. While following is on, no library radio is checked. Activating one turns following off and selects that theme.

Dark and Light dots use the terminal fallbacks already in `Terminal.tsx`, because those themes do not define terminal colors:

- Dark: `#1b1c1e`, `#d49393`, `#adc496`, `#9bb8d2`
- Light: `#faf9f6`, `#9f3636`, `#486a32`, `#355e8c`

Other rows use `bg`, `terminal-red`, `terminal-green`, and `terminal-blue`, falling back to `syntax-keyword`, `syntax-string`, and `file-icon` only if a terminal key is absent. Built-ins define the terminal keys, so the fallback is for sparse imports.

The workspace menu item that now toggles Dark and Light shows `Theme: ` plus the current display name. It opens Settings and moves focus to the existing Theme heading. That heading is focusable with `tabIndex={-1}`.

## Errors

Unavailable Omarchy and a bad `colors.toml` leave the current colors in place and show one inline sentence in the Theme section. No dialog and no toast. Import errors stay inline and do not change the theme. A bundled theme that fails `parseTheme` fails the test suite; the app does not try to recover from a broken catalog at runtime.

## Tests

Frontend:

- Every bundled library JSON parses, uses version 1, and includes every `colorKeys` entry.
- A Nord `colors.toml` fixture maps Original, Darker, and Contrast to the tokens in the table above, including the `raised` mix.
- A palette missing a required key fails mapping.
- Search and the Light/Dark filter return the expected rows together.
- Applying `builtin:nord` sets variables and `data-theme="dark"`. Applying `light` clears inline overrides.
- `tokyo-night` humanizes to `Tokyo Night`.

Rust:

- The flat parser accepts a Nord fixture and rejects a missing key, a bad color, and a bad mode.
- A slug containing `..` or a slash is rejected.
- Resolution prefers the user file over the stock root when both exist.

## Documentation

Update `DESIGN.md` so the Theme section describes the library, the current-theme row, and Follow Omarchy instead of two preview cards. Update the README import section so Dark, Light, and the named built-ins are in the library, and import remains for extra JSON files.

## Out of scope

Installing or editing Omarchy themes, `prefers-color-scheme`, font sync, the Omarchy variant changing a built-in palette, and Strata's larger base16 catalog.
