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
  interfaceFont,
  setInterfaceFont,
  editorFont,
  setEditorFont,
  fontSize,
  setFontSize,
  close,
}: {
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  interfaceFont: string;
  setInterfaceFont: (value: string) => void;
  editorFont: string;
  setEditorFont: (value: string) => void;
  fontSize: number;
  setFontSize: (value: number) => void;
  close: () => void;
}) {
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
  const [sizeInput, setSizeInput] = useState(String(fontSize));
  useEffect(() => {
    heading.current?.focus();
  }, []);
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
          <h2 id="theme-settings-title">Theme</h2>
          <p className="settings-description">
            Applies to the editor, interface and terminal.
          </p>
          <div
            className="theme-choices"
            role="radiogroup"
            aria-label="Application theme"
          >
            {(["dark", "light"] as const).map((option) => (
              <label
                key={option}
                className={`theme-choice ${theme === option ? "chosen" : ""}`}
              >
                <span
                  className="theme-preview"
                  data-variant={option}
                  aria-hidden="true"
                >
                  <span className="theme-preview-sidebar" />
                  <span className="theme-preview-code">
                    <span>const</span>
                    {" title = "}
                    <span>"Hello"</span>
                    {";\n\n<main>\n  <h1>{title}</h1>\n</main>"}
                  </span>
                </span>
                <span className="theme-caption">
                  <span>{option === "dark" ? "Dark" : "Light"}</span>
                  <input
                    type="radio"
                    name="application-theme"
                    value={option}
                    checked={theme === option}
                    onChange={() => setTheme(option)}
                  />
                </span>
              </label>
            ))}
          </div>
        </section>
        <p className="settings-note">Changes are saved automatically.</p>
      </div>
    </section>
  );
}
