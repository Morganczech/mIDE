import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  applyPalette,
  applyTheme,
  colorKeys,
  loadThemes,
  parseTheme,
  themeId,
} from "../src/lib/themes";
import {
  filterLibrary,
  humanizeSlug,
  mapOmarchyTheme,
  type OmarchySource,
} from "../src/lib/omarchy-theme";
import { builtinThemes } from "../src/lib/builtin-themes";
const text = readFileSync(
  new URL("../themes/quiet-blue.json", import.meta.url),
  "utf8",
);
afterEach(() => vi.unstubAllGlobals());
describe("imported themes", () => {
  it("accepts the documented example and sparse color overrides", () => {
    expect(parseTheme(text).name).toBe("Quiet Blue");
    expect(
      parseTheme(
        '{"version":1,"name":"Sparse","variant":"light","colors":{"bg":"#ffffff"}}',
      ).variant,
    ).toBe("light");
  });
  it("rejects malformed, executable, unsupported and oversized input", () => {
    for (const bad of [
      "{",
      "null",
      "[]",
      text.replace('"version": 1', '"version": 2'),
      text.replace('"#19202b"', '"url(https://example.com)"'),
      text.replace('"bg":', '"unknown":'),
      text.replace('"Quiet Blue"', '""'),
      " ".repeat(65537),
    ]) {
      expect(() => parseTheme(bad)).toThrow();
    }
  });
  it("validates persisted imports and tolerates damaged storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => `[${text}]` });
    expect(loadThemes()).toHaveLength(1);
    vi.stubGlobal("localStorage", { getItem: () => "{broken" });
    expect(loadThemes()).toEqual([]);
  });
  it("clears previous overrides when switching to a built-in theme", () => {
    const styles = new Map<string, string>();
    const root = {
      dataset: { theme: "" },
      style: {
        setProperty: (key: string, value: string) => styles.set(key, value),
        removeProperty: (key: string) => styles.delete(key),
      },
    } as unknown as HTMLElement;
    const theme = parseTheme(text);
    applyTheme(themeId(theme), [theme], root);
    expect(styles.get("--bg")).toBe("#19202b");
    expect(root.dataset.theme).toBe("dark");
    applyTheme("light", [theme], root);
    expect(styles.size).toBe(0);
    expect(root.dataset.theme).toBe("light");
  });
  it("loads every bundled palette and applies a built-in theme", () => {
    const directory = new URL("../themes/", import.meta.url);
    const files = readdirSync(directory)
      .filter((name) => name.endsWith(".json") && name !== "quiet-blue.json")
      .sort();
    expect(files).toEqual([
      "dracula.json",
      "github-light.json",
      "material-lighter.json",
      "material-ocean.json",
      "monokai.json",
      "nord.json",
      "one-dark.json",
      "one-light.json",
      "solarized-light.json",
    ]);
    expect(builtinThemes.map((item) => item.id)).toEqual([
      "builtin:dracula",
      "builtin:one-dark",
      "builtin:nord",
      "builtin:monokai",
      "builtin:material-ocean",
      "builtin:one-light",
      "builtin:github-light",
      "builtin:solarized-light",
      "builtin:material-lighter",
    ]);
    const styles = new Map<string, string>();
    const root = {
      dataset: { theme: "" },
      style: {
        setProperty: (key: string, value: string) => styles.set(key, value),
        removeProperty: (key: string) => styles.delete(key),
      },
    } as unknown as HTMLElement;
    for (const file of files) {
      const theme = parseTheme(
        readFileSync(new URL(file, directory), "utf8"),
      );
      expect(theme.version).toBe(1);
      expect(Object.keys(theme.colors).sort()).toEqual([...colorKeys].sort());
    }
    const nord = parseTheme(
      readFileSync(new URL("nord.json", directory), "utf8"),
    );
    applyTheme("builtin:nord", [], root, [
      { id: "builtin:nord", theme: nord },
    ]);
    expect(root.dataset.theme).toBe("dark");
    expect(styles.get("--bg")).toBe(nord.colors.bg);
    applyTheme("light", [], root, [{ id: "builtin:nord", theme: nord }]);
    expect(styles.size).toBe(0);
    expect(root.dataset.theme).toBe("light");
  });
});
const nordSource: OmarchySource = {
  name: "Nord",
  mode: "dark",
  colors: {
    mode: "dark",
    accent: "#81a1c1",
    selection: "#434c5e",
    muted: "#4c566a",
    background: "#2e3440",
    dark_background: "#222730",
    darker_background: "#191c23",
    lighter_background: "#3b4252",
    foreground: "#d8dee9",
    dark_foreground: "#667080",
    light_foreground: "#adb5c4",
    bright_foreground: "#d8dee9",
    red: "#bf616a",
    yellow: "#ebcb8b",
    orange: "#d5967a",
    green: "#a3be8c",
    cyan: "#88c0d0",
    blue: "#81a1c1",
    magenta: "#b48ead",
    bright_red: "#bf616a",
    bright_yellow: "#ebcb8b",
    bright_green: "#a3be8c",
    bright_cyan: "#8fbcbb",
    bright_blue: "#81a1c1",
    bright_magenta: "#b48ead",
  },
};
describe("Omarchy theme mapping", () => {
  it("humanizes a theme slug", () => {
    expect(humanizeSlug("tokyo-night")).toBe("Tokyo Night");
  });
  it("maps Nord across the three surface variants", () => {
    const original = mapOmarchyTheme(nordSource, "original");
    expect(original.variant).toBe("dark");
    expect(original.colors.bg).toBe("#2e3440");
    expect(original.colors.surface).toBe("#3b4252");
    expect(original.colors.raised).toBe("#535969");
    expect(original.colors["syntax-keyword"]).toBe("#b48ead");
    expect(original.colors["syntax-comment"]).toBe("#667080");
    expect(original.colors["terminal-red"]).toBe("#bf616a");
    expect(original.colors.border).toBe("#4c566a");
    const darker = mapOmarchyTheme(nordSource, "darker");
    expect(darker.colors.bg).toBe("#191c23");
    expect(darker.colors.surface).toBe("#222730");
    expect(darker.colors.raised).toBe("#2e3440");
    const contrast = mapOmarchyTheme(nordSource, "contrast");
    expect(contrast.colors.bg).toBe("#2e3440");
    expect(contrast.colors.raised).toBe("#535969");
    expect(contrast.colors.fg).toBe("#d8dee9");
    expect(contrast.colors.muted).toBe("#adb5c4");
    expect(contrast.colors["syntax-comment"]).toBe("#667080");
    expect(contrast.colors["terminal-white"]).toBe("#d8dee9");
    expect(Object.keys(contrast.colors).sort()).toEqual([...colorKeys].sort());
  });
  it("rejects a palette that is missing a required color", () => {
    const broken = {
      ...nordSource,
      colors: { ...nordSource.colors },
    };
    delete broken.colors.orange;
    expect(() => mapOmarchyTheme(broken, "original")).toThrow(
      "Omarchy theme file is invalid.",
    );
  });
  it("filters the library by name and variant together", () => {
    const rows = [
      { name: "Dark", variant: "dark" as const },
      { name: "Light", variant: "light" as const },
      { name: "Nord", variant: "dark" as const },
      { name: "One Light", variant: "light" as const },
    ];
    expect(
      filterLibrary(rows, "li", "light").map((row) => row.name),
    ).toEqual(["Light", "One Light"]);
    expect(filterLibrary(rows, "nord", "light")).toEqual([]);
    expect(filterLibrary(rows, "  NORD ", "all").map((row) => row.name)).toEqual([
      "Nord",
    ]);
  });
  it("paints a mapped palette over the previous theme", () => {
    const styles = new Map<string, string>();
    const root = {
      dataset: { theme: "dark" },
      style: {
        setProperty: (key: string, value: string) => styles.set(key, value),
        removeProperty: (key: string) => styles.delete(key),
      },
    } as unknown as HTMLElement;
    styles.set("--bg", "#111111");
    applyPalette(mapOmarchyTheme(nordSource, "darker"), root);
    expect(root.dataset.theme).toBe("dark");
    expect(styles.get("--bg")).toBe("#191c23");
    expect(styles.has("--missing")).toBe(false);
  });
});
