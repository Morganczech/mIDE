import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { applyTheme, loadThemes, parseTheme, themeId } from "../src/lib/themes";
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
});
