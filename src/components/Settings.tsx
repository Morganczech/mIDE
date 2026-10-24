import { parseTheme, swatchColors, themeId, type CustomTheme } from "../lib/themes";
import { builtinThemes } from "../lib/builtin-themes";
import { filterLibrary, type OmarchyVariant } from "../lib/omarchy-theme";
import { useEffect, useRef, useState } from "react";
import { fontStack, normalizeFont } from "../lib/appearance";
import { backend, errorMessage, type SystemFont } from "../lib/backend";
import { modifierKey } from "./KeyboardShortcuts";

function FontPicker({
  id,
  label,
  value,
  change,
  editor = false,
  fonts,
  loading,
}: {
  id: string;
  label: string;
  value: string;
  change: (value: string) => void;
  editor?: boolean;
  fonts: SystemFont[];
  loading: boolean;
}) {
  const presets = editor
    ? ["", "monospace"]
    : ["", "system-ui", "serif", "monospace"];
  const [custom, setCustom] = useState(false);
  const available = editor ? fonts.filter((font) => font.monospace) : fonts;
  const known =
    presets.includes(value) || available.some((font) => font.name === value);
  const showCustom = custom || (!loading && !known);
  return (
    <div className="font-picker">
      <select
        id={id}
        aria-label={label}
        value={showCustom ? "custom" : value}
        onChange={(event) => {
          const next = event.target.value;
          setCustom(next === "custom");
          if (next !== "custom") change(next);
        }}
      >
        <option value="">Default</option>
        {!editor && <option value="system-ui">System sans-serif</option>}
        {!editor && <option value="serif">System serif</option>}
        <option value="monospace">System monospace</option>
        {loading && value && !known && <option value={value}>{value}</option>}
        {available.length > 0 && (
          <optgroup
            label={editor ? "Installed monospace fonts" : "Installed fonts"}
          >
            {available.map((font) => (
              <option key={font.name} value={font.name}>
                {font.name}
              </option>
            ))}
          </optgroup>
        )}
        <option value="custom">Custom font…</option>
      </select>
      {showCustom && (
        <input
          aria-label={`${label} name`}
          maxLength={100}
          value={value}
          placeholder="Installed font family"
          onChange={(event) => change(event.target.value)}
          onBlur={() => change(normalizeFont(value))}
        />
      )}
    </div>
  );
}

export function Settings({
  theme,
  setTheme,
  customThemes,
  updateThemes,
  follow,
  setFollow,
  omarchyVariant,
  setOmarchyVariant,
  omarchyTheme,
  omarchyName,
  omarchyError,
  focusTheme,
  interfaceFont,
  setInterfaceFont,
  editorFont,
  setEditorFont,
  fontSize,
  setFontSize,
  close,
}: {
  theme: string;
  setTheme: (theme: string) => void;
  customThemes: CustomTheme[];
  updateThemes: (themes: CustomTheme[]) => void;
  follow: boolean;
  setFollow: (value: boolean) => void;
  omarchyVariant: OmarchyVariant;
  setOmarchyVariant: (value: OmarchyVariant) => void;
  omarchyTheme: CustomTheme | null;
  omarchyName: string;
  omarchyError: string;
  focusTheme: boolean;
  interfaceFont: string;
  setInterfaceFont: (value: string) => void;
  editorFont: string;
  setEditorFont: (value: string) => void;
  fontSize: number;
  setFontSize: (value: number) => void;
  close: () => void;
}) {
  const [themeError, setThemeError] = useState("");
  const [importing, setImporting] = useState(false);
  const importTheme = async () => {
    setThemeError("");
    setImporting(true);
    try {
      const text = await backend.importTheme();
      if (text === null) return;
      const next = parseTheme(text);
      const themes = customThemes.filter((item) => item.name !== next.name);
      if (themes.length >= 50)
        throw new Error(
          "Remove a theme before importing another (maximum 50).",
        );
      updateThemes([...themes, next]);
      setTheme(themeId(next));
    } catch (error) {
      setThemeError(errorMessage(error));
    } finally {
      setImporting(false);
    }
  };
  const [fonts, setFonts] = useState<SystemFont[]>([]);
  const [fontsLoading, setFontsLoading] = useState(true);
  const [fontsError, setFontsError] = useState("");
  const [fontRequest, setFontRequest] = useState(0);
  useEffect(() => {
    let disposed = false;
    setFontsLoading(true);
    setFontsError("");
    backend
      .fonts()
      .then((result) => {
        if (!disposed) setFonts(result);
      })
      .catch((error) => {
        if (!disposed) setFontsError(errorMessage(error));
      })
      .finally(() => {
        if (!disposed) setFontsLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [fontRequest]);
  const heading = useRef<HTMLHeadingElement>(null);
  const themeHeading = useRef<HTMLHeadingElement>(null);
  const [sizeInput, setSizeInput] = useState(String(fontSize));
  const [themeQuery, setThemeQuery] = useState("");
  const [themeFilter, setThemeFilter] = useState<"all" | "dark" | "light">(
    "all",
  );
  useEffect(() => {
    (focusTheme ? themeHeading : heading).current?.focus();
  }, [focusTheme]);
  useEffect(() => {
    setSizeInput(String(fontSize));
  }, [fontSize]);
  const commitSize = () => {
    const value = Number(sizeInput);
    const next =
      sizeInput.trim() && Number.isFinite(value)
        ? Math.max(10, Math.min(32, Math.round(value)))
        : fontSize;
    setFontSize(next);
    setSizeInput(String(next));
  };
  const library = [
    {
      id: "dark",
      name: "Dark",
      variant: "dark" as const,
      colors: {},
      kind: "dark" as const,
      removable: false,
    },
    {
      id: "light",
      name: "Light",
      variant: "light" as const,
      colors: {},
      kind: "light" as const,
      removable: false,
    },
    ...builtinThemes.map((item) => ({
      id: item.id,
      name: item.theme.name,
      variant: item.theme.variant,
      colors: item.theme.colors,
      kind: "palette" as const,
      removable: false,
    })),
    ...customThemes.map((item) => ({
      id: themeId(item),
      name: item.name,
      variant: item.variant,
      colors: item.colors,
      kind: "palette" as const,
      removable: true,
    })),
  ];
  const visible = filterLibrary(library, themeQuery, themeFilter);
  const selected = library.find((item) => item.id === theme) ?? library[0];
  const currentName =
    follow && omarchyName ? omarchyName : selected.name;
  const currentDots =
    follow && omarchyTheme
      ? swatchColors("palette", omarchyTheme.variant, omarchyTheme.colors)
      : swatchColors(selected.kind, selected.variant, selected.colors);
  return (
    <section className="settings-page" aria-labelledby="settings-heading">
      <div className="settings-content">
        <header className="settings-header">
          <h1 id="settings-heading" tabIndex={-1} ref={heading}>
            Settings
          </h1>
          <button onClick={close}>
            Back to Editor <kbd>Esc</kbd>
          </button>
        </header>
        <section
          className="settings-section"
          aria-labelledby="text-settings-title"
        >
          <h2 id="text-settings-title">Text</h2>
          <div className="settings-row">
            <div>
              <label htmlFor="interface-font">Interface font</label>
              <p>Menus, file lists and dialogs.</p>
            </div>
            <FontPicker
              id="interface-font"
              label="Interface font"
              fonts={fonts}
              loading={fontsLoading}
              value={interfaceFont}
              change={setInterfaceFont}
            />
          </div>
          <div className="settings-row">
            <div>
              <label htmlFor="editor-font">Editor font</label>
              <p>Code and terminal. Use a monospace font.</p>
            </div>
            <FontPicker
              id="editor-font"
              label="Editor font"
              fonts={fonts}
              loading={fontsLoading}
              value={editorFont}
              change={setEditorFont}
              editor
            />
          </div>
          <div className="settings-row">
            <div>
              <label htmlFor="editor-text-size">Editor text size</label>
              <p>10–32 pixels. {modifierKey} + + / − / 0</p>
            </div>
            <div className="font-size-control">
              <button
                aria-label="Decrease editor text size"
                disabled={fontSize <= 10}
                onClick={() => setFontSize(fontSize - 1)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h10" />
                </svg>
              </button>
              <input
                id="editor-text-size"
                type="number"
                min={10}
                max={32}
                step={1}
                value={sizeInput}
                onChange={(event) => {
                  setSizeInput(event.target.value);
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value >= 10 && value <= 32)
                    setFontSize(value);
                }}
                onBlur={commitSize}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitSize();
                    event.currentTarget.blur();
                  }
                }}
              />
              <button
                aria-label="Increase editor text size"
                disabled={fontSize >= 32}
                onClick={() => setFontSize(fontSize + 1)}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h10M8 3v10" />
                </svg>
              </button>
            </div>
          </div>
          <p className="settings-note">
            Choose an installed font or enter its family name. Reopen Settings
            after installing new fonts.
          </p>
          {fontsLoading && (
            <p className="settings-note" role="status">
              Loading installed fonts…
            </p>
          )}
          {fontsError && (
            <div className="settings-note" role="status">
              Font list unavailable. You can still enter a font name.{" "}
              <button
                className="font-retry"
                onClick={() => setFontRequest((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          )}
          <pre
            className="settings-code"
            aria-label="Editor font preview"
            style={{ fontFamily: fontStack(editorFont, "editor"), fontSize }}
          >
            <code>
              <span className="preview-comment">{"// Your editor font"}</span>
              {"\n"}
              <span className="preview-keyword">const</span>
              {" title = "}
              <span className="preview-string">{'"Hello, world"'}</span>
              {";\n\n"}
              {"<main>\n  <h1>{title}</h1>\n</main>"}
            </code>
          </pre>
        </section>
        <section
          className="settings-section"
          aria-labelledby="theme-settings-title"
        >
          <h2 id="theme-settings-title" tabIndex={-1} ref={themeHeading}>
            Theme
          </h2>
          <p className="settings-description">
            Applies to the editor, interface and terminal.
          </p>
          <div className="settings-row">
            <div>
              <p className="theme-row-title">Follow Omarchy</p>
              <p>Use the active Omarchy theme and switch when it changes.</p>
            </div>
            <button
              type="button"
              role="switch"
              className={follow ? "switch on" : "switch"}
              aria-checked={follow}
              aria-label="Follow Omarchy"
              onClick={() => setFollow(!follow)}
            >
              <span className="switch-knob" />
            </button>
          </div>
          <div className="settings-row">
            <div>
              <label htmlFor="omarchy-variant">Omarchy variant</label>
              <p>Original palette, darker surfaces, or stronger contrast.</p>
            </div>
            <select
              id="omarchy-variant"
              value={omarchyVariant}
              disabled={!follow}
              onChange={(event) =>
                setOmarchyVariant(event.target.value as OmarchyVariant)
              }
            >
              <option value="original">Original</option>
              <option value="darker">Darker</option>
              <option value="contrast">Contrast</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <p className="theme-row-title">Current theme</p>
              <p>{currentName}</p>
            </div>
            <span className="theme-dots" aria-hidden="true">
              {currentDots.map((color, index) => (
                <span key={index} style={{ background: color }} />
              ))}
            </span>
          </div>
          <div className="theme-library-bar">
            <p className="theme-row-title">Theme library</p>
            <input
              aria-label="Search themes"
              placeholder="Search themes"
              value={themeQuery}
              onChange={(event) => setThemeQuery(event.target.value)}
            />
            <div
              className="theme-filter"
              role="radiogroup"
              aria-label="Theme variant"
            >
              {(
                [
                  ["all", "All"],
                  ["light", "Light"],
                  ["dark", "Dark"],
                ] as const
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="theme-variant-filter"
                    checked={themeFilter === value}
                    onChange={() => setThemeFilter(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div
            className="theme-library"
            role="radiogroup"
            aria-label="Theme library"
          >
            {visible.length === 0 && (
              <p className="settings-note">No matching themes.</p>
            )}
            {visible.map((item) => (
              <div className="settings-row" key={item.id}>
                <label className="theme-library-label">
                  <input
                    type="radio"
                    name="application-theme"
                    checked={!follow && theme === item.id}
                    onChange={() => setTheme(item.id)}
                  />
                  <span className="theme-dots" aria-hidden="true">
                    {swatchColors(item.kind, item.variant, item.colors).map(
                      (color, index) => (
                        <span key={index} style={{ background: color }} />
                      ),
                    )}
                  </span>
                  <span className="theme-library-name">{item.name}</span>
                  <span className="theme-variant" aria-hidden="true">
                    {item.variant === "dark" ? "Dark" : "Light"}
                  </span>
                </label>
                {item.removable && (
                  <button
                    type="button"
                    aria-label={`Remove theme ${item.name}`}
                    onClick={() => {
                      try {
                        updateThemes(
                          customThemes.filter(
                            (value) => value.name !== item.name,
                          ),
                        );
                        if (theme === item.id) setTheme(item.variant);
                        setThemeError("");
                      } catch (error) {
                        setThemeError(errorMessage(error));
                      }
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="settings-row">
            <div>
              <p>
                Import a mIDE JSON theme. Matching names replace an existing
                theme.
              </p>
            </div>
            <button disabled={importing} onClick={importTheme}>
              {importing ? "Importing…" : "Import Theme…"}
            </button>
          </div>
          {omarchyError && (
            <p className="settings-note" role="alert">
              {omarchyError}
            </p>
          )}
          {themeError && (
            <p className="settings-note" role="alert">
              {themeError}
            </p>
          )}
        </section>
        <p className="settings-note">Changes are saved automatically.</p>
      </div>
    </section>
  );
}
