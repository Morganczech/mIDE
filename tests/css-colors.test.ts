import { ensureSyntaxTree } from "@codemirror/language";
import { describe, expect, it } from "vitest";
import { createEditorState } from "../src/editor/config";
import {
  colorTextFromPicker,
  cssColors,
  hexToHsv,
  hsvToHex,
} from "../src/editor/css-colors";

function colorsIn(path: string, text: string) {
  const { state } = createEditorState(text, path, "LF");
  ensureSyntaxTree(state, text.length, 1000);
  return cssColors(state).map((color) => ({
    text: text.slice(color.from, color.to),
    hex: color.hex,
    alpha: color.alpha,
  }));
}

describe("CSS color swatches", () => {
  it("finds hex, rgb, hsl and named colors, skipping non-colors", () => {
    const text =
      '#abc { color: #abc; background: #aabbcc; border: 1px solid #aabbcc80; outline-color: red; box-shadow: rgb(1, 2, 3); caret-color: hsl(120, 100%, 50%); fill: transparent; width: 1px; content: "#fff"; background-image: var(--c); }';
    expect(colorsIn("a.css", text)).toEqual([
      { text: "#abc", hex: "#aabbcc", alpha: 1 },
      { text: "#aabbcc", hex: "#aabbcc", alpha: 1 },
      { text: "#aabbcc80", hex: "#aabbcc", alpha: 128 / 255 },
      { text: "red", hex: "#ff0000", alpha: 1 },
      { text: "rgb(1, 2, 3)", hex: "#010203", alpha: 1 },
      { text: "hsl(120, 100%, 50%)", hex: "#00ff00", alpha: 1 },
      { text: "transparent", hex: "#000000", alpha: 0 },
    ]);
  });

  it("accepts modern function syntax and percentage channels", () => {
    const text =
      "a { color: RGB(255, 0, 0); background: rgba(1, 2, 3, .5); border-color: hsl(120 100% 50%); outline-color: rgb(100%, 0%, 0%); }";
    expect(colorsIn("a.css", text)).toEqual([
      { text: "RGB(255, 0, 0)", hex: "#ff0000", alpha: 1 },
      { text: "rgba(1, 2, 3, .5)", hex: "#010203", alpha: 0.5 },
      { text: "hsl(120 100% 50%)", hex: "#00ff00", alpha: 1 },
      { text: "rgb(100%, 0%, 0%)", hex: "#ff0000", alpha: 1 },
    ]);
  });

  it("marks colors inside style blocks and gradients, not inline attributes", () => {
    const html =
      '<style>a { color: #fff; }</style><p style="color: blue">x</p>';
    expect(colorsIn("a.html", html)).toEqual([
      { text: "#fff", hex: "#ffffff", alpha: 1 },
    ]);
    const gradient = "a { background: linear-gradient(#fff, #000); }";
    expect(colorsIn("a.css", gradient).map((color) => color.text)).toEqual([
      "#fff",
      "#000",
    ]);
    const astro = "<style>main { color: rebeccapurple; }</style>";
    expect(colorsIn("index.astro", astro)).toEqual([
      { text: "rebeccapurple", hex: "#663399", alpha: 1 },
    ]);
  });

  it("writes the picked color as hex and keeps partial alpha", () => {
    expect(colorTextFromPicker("#00FF00", 1)).toBe("#00ff00");
    expect(colorTextFromPicker("#ffffff", 0.5)).toBe("#ffffff80");
    expect(colorTextFromPicker("#aabbcc", 128 / 255)).toBe("#aabbcc80");
    expect(colorTextFromPicker("#000000", 0)).toBe("#00000000");
  });

  it("converts hex and hsv without drifting primaries", () => {
    expect(hsvToHex(0, 1, 1)).toBe("#ff0000");
    expect(hsvToHex(120, 1, 1)).toBe("#00ff00");
    expect(hsvToHex(240, 1, 1)).toBe("#0000ff");
    expect(hsvToHex(0, 0, 1)).toBe("#ffffff");
    expect(hexToHsv("#00ff00")).toMatchObject({ h: 120, s: 1, v: 1 });
    const rose = hexToHsv("#e11d48");
    expect(hsvToHex(rose.h, rose.s, rose.v)).toBe("#e11d48");
  });
});
