import { describe, expect, it } from "vitest";
import {
  defaultEditorFont,
  defaultInterfaceFont,
  fontStack,
  normalizeFont,
} from "../src/lib/appearance";
describe("font preferences", () => {
  it("keeps existing defaults and handles named and generic fonts", () => {
    expect(fontStack("", "editor")).toBe(defaultEditorFont);
    expect(fontStack("", "interface")).toBe(defaultInterfaceFont);
    expect(fontStack("monospace", "editor")).toBe(
      `monospace, ${defaultEditorFont}`,
    );
    expect(fontStack("  Liberation Mono  ", "editor")).toBe(
      `"Liberation Mono", ${defaultEditorFont}`,
    );
    expect(fontStack('A "quoted" font', "interface")).toContain(
      '"A \\"quoted\\" font"',
    );
  });
  it("ignores invalid stored names without breaking the font declaration", () => {
    expect(normalizeFont("x".repeat(101))).toBe("");
    expect(fontStack("bad\nfont", "editor")).toBe(defaultEditorFont);
  });
});
