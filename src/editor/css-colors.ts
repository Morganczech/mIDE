import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

export type CssColor = {
  from: number;
  to: number;
  source: string;
  hex: string;
  alpha: number;
  css: string;
};

const namedColors: Record<string, string> = {
  transparent: "#00000000",
  aliceblue: "#f0f8ff",
  antiquewhite: "#faebd7",
  aqua: "#00ffff",
  aquamarine: "#7fffd4",
  azure: "#f0ffff",
  beige: "#f5f5dc",
  bisque: "#ffe4c4",
  black: "#000000",
  blanchedalmond: "#ffebcd",
  blue: "#0000ff",
  blueviolet: "#8a2be2",
  brown: "#a52a2a",
  burlywood: "#deb887",
  cadetblue: "#5f9ea0",
  chartreuse: "#7fff00",
  chocolate: "#d2691e",
  coral: "#ff7f50",
  cornflowerblue: "#6495ed",
  cornsilk: "#fff8dc",
  crimson: "#dc143c",
  cyan: "#00ffff",
  darkblue: "#00008b",
  darkcyan: "#008b8b",
  darkgoldenrod: "#b8860b",
  darkgray: "#a9a9a9",
  darkgreen: "#006400",
  darkgrey: "#a9a9a9",
  darkkhaki: "#bdb76b",
  darkmagenta: "#8b008b",
  darkolivegreen: "#556b2f",
  darkorange: "#ff8c00",
  darkorchid: "#9932cc",
  darkred: "#8b0000",
  darksalmon: "#e9967a",
  darkseagreen: "#8fbc8f",
  darkslateblue: "#483d8b",
  darkslategray: "#2f4f4f",
  darkslategrey: "#2f4f4f",
  darkturquoise: "#00ced1",
  darkviolet: "#9400d3",
  deeppink: "#ff1493",
  deepskyblue: "#00bfff",
  dimgray: "#696969",
  dimgrey: "#696969",
  dodgerblue: "#1e90ff",
  firebrick: "#b22222",
  floralwhite: "#fffaf0",
  forestgreen: "#228b22",
  fuchsia: "#ff00ff",
  gainsboro: "#dcdcdc",
  ghostwhite: "#f8f8ff",
  gold: "#ffd700",
  goldenrod: "#daa520",
  gray: "#808080",
  green: "#008000",
  greenyellow: "#adff2f",
  grey: "#808080",
  honeydew: "#f0fff0",
  hotpink: "#ff69b4",
  indianred: "#cd5c5c",
  indigo: "#4b0082",
  ivory: "#fffff0",
  khaki: "#f0e68c",
  lavender: "#e6e6fa",
  lavenderblush: "#fff0f5",
  lawngreen: "#7cfc00",
  lemonchiffon: "#fffacd",
  lightblue: "#add8e6",
  lightcoral: "#f08080",
  lightcyan: "#e0ffff",
  lightgoldenrodyellow: "#fafad2",
  lightgray: "#d3d3d3",
  lightgreen: "#90ee90",
  lightgrey: "#d3d3d3",
  lightpink: "#ffb6c1",
  lightsalmon: "#ffa07a",
  lightseagreen: "#20b2aa",
  lightskyblue: "#87cefa",
  lightslategray: "#778899",
  lightslategrey: "#778899",
  lightsteelblue: "#b0c4de",
  lightyellow: "#ffffe0",
  lime: "#00ff00",
  limegreen: "#32cd32",
  linen: "#faf0e6",
  magenta: "#ff00ff",
  maroon: "#800000",
  mediumaquamarine: "#66cdaa",
  mediumblue: "#0000cd",
  mediumorchid: "#ba55d3",
  mediumpurple: "#9370db",
  mediumseagreen: "#3cb371",
  mediumslateblue: "#7b68ee",
  mediumspringgreen: "#00fa9a",
  mediumturquoise: "#48d1cc",
  mediumvioletred: "#c71585",
  midnightblue: "#191970",
  mintcream: "#f5fffa",
  mistyrose: "#ffe4e1",
  moccasin: "#ffe4b5",
  navajowhite: "#ffdead",
  navy: "#000080",
  oldlace: "#fdf5e6",
  olive: "#808000",
  olivedrab: "#6b8e23",
  orange: "#ffa500",
  orangered: "#ff4500",
  orchid: "#da70d6",
  palegoldenrod: "#eee8aa",
  palegreen: "#98fb98",
  paleturquoise: "#afeeee",
  palevioletred: "#db7093",
  papayawhip: "#ffefd5",
  peachpuff: "#ffdab9",
  peru: "#cd853f",
  pink: "#ffc0cb",
  plum: "#dda0dd",
  powderblue: "#b0e0e6",
  purple: "#800080",
  rebeccapurple: "#663399",
  red: "#ff0000",
  rosybrown: "#bc8f8f",
  royalblue: "#4169e1",
  saddlebrown: "#8b4513",
  salmon: "#fa8072",
  sandybrown: "#f4a460",
  seagreen: "#2e8b57",
  seashell: "#fff5ee",
  sienna: "#a0522d",
  silver: "#c0c0c0",
  skyblue: "#87ceeb",
  slateblue: "#6a5acd",
  slategray: "#708090",
  slategrey: "#708090",
  snow: "#fffafa",
  springgreen: "#00ff7f",
  steelblue: "#4682b4",
  tan: "#d2b48c",
  teal: "#008080",
  thistle: "#d8bfd8",
  tomato: "#ff6347",
  turquoise: "#40e0d0",
  violet: "#ee82ee",
  wheat: "#f5deb3",
  white: "#ffffff",
  whitesmoke: "#f5f5f5",
  yellow: "#ffff00",
  yellowgreen: "#9acd32",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function byte(value: number) {
  return Math.round(clamp(value, 0, 255))
    .toString(16)
    .padStart(2, "0");
}

function encoded(r: number, g: number, b: number, alpha: number) {
  const hex = `#${byte(r)}${byte(g)}${byte(b)}`;
  const safeAlpha = clamp(alpha, 0, 1);
  const alphaByte = Math.round(safeAlpha * 255);
  return {
    hex,
    alpha: safeAlpha,
    css:
      alphaByte >= 255
        ? hex
        : `${hex}${alphaByte.toString(16).padStart(2, "0")}`,
  };
}

function parseHex(text: string) {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(
    text,
  );
  if (!match) return null;
  let hex = match[1];
  if (hex.length <= 4) hex = [...hex].map((digit) => digit + digit).join("");
  return encoded(
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
  );
}

type ColorToken = { value: number; unit: string };

function readToken(text: string) {
  const match =
    /^([+-]?(?:\d+\.?\d*|\.\d+))(%|deg|turn|rad|grad)?$/i.exec(text);
  if (!match) return null;
  return {
    value: Number(match[1]),
    unit: (match[2] ?? "").toLowerCase(),
  } satisfies ColorToken;
}

function readAlpha(token: ColorToken) {
  if (token.unit === "%") return clamp(token.value / 100, 0, 1);
  if (token.unit === "") return clamp(token.value, 0, 1);
  return null;
}

function components(body: string) {
  let main = body.trim();
  let alpha: number | null = null;
  const slash = main.indexOf("/");
  if (slash !== -1) {
    const alphaToken = readToken(main.slice(slash + 1).trim());
    if (!alphaToken) return null;
    alpha = readAlpha(alphaToken);
    if (alpha === null) return null;
    main = main.slice(0, slash).trim();
  }
  const chunks = main.includes(",")
    ? main.split(",").map((part) => part.trim())
    : main.split(/\s+/).filter(Boolean);
  const parts: ColorToken[] = [];
  for (const chunk of chunks) {
    const token = readToken(chunk);
    if (!token) return null;
    parts.push(token);
  }
  if (alpha === null && parts.length === 4) {
    alpha = readAlpha(parts[3]);
    if (alpha === null) return null;
    parts.pop();
  }
  if (parts.length !== 3) return null;
  return { parts, alpha: alpha ?? 1 };
}

function rgbChannel(token: ColorToken) {
  if (token.unit === "%") return clamp(token.value, 0, 100) * 2.55;
  if (token.unit === "") return clamp(token.value, 0, 255);
  return null;
}

function hue(token: ColorToken) {
  if (token.unit === "" || token.unit === "deg") return token.value;
  if (token.unit === "turn") return token.value * 360;
  if (token.unit === "rad") return (token.value * 180) / Math.PI;
  if (token.unit === "grad") return token.value * 0.9;
  return null;
}

function hslToRgb(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function parseFunction(text: string) {
  const match = /^([a-z]+)\(([\s\S]*)\)$/i.exec(text.trim());
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (name !== "rgb" && name !== "rgba" && name !== "hsl" && name !== "hsla")
    return null;
  const parsed = components(match[2]);
  if (!parsed) return null;
  if (name === "rgb" || name === "rgba") {
    const channels = parsed.parts.map(rgbChannel);
    if (channels.some((channel) => channel === null)) return null;
    return encoded(channels[0]!, channels[1]!, channels[2]!, parsed.alpha);
  }
  const [h, s, l] = parsed.parts;
  const angle = hue(h);
  if (angle === null || s.unit !== "%" || l.unit !== "%") return null;
  const [r, g, b] = hslToRgb(
    angle,
    clamp(s.value, 0, 100) / 100,
    clamp(l.value, 0, 100) / 100,
  );
  return encoded(r, g, b, parsed.alpha);
}

function parseColor(source: string) {
  const text = source.trim();
  if (text.startsWith("#")) return parseHex(text);
  const named = namedColors[text.toLowerCase()];
  if (named) return parseHex(named);
  return parseFunction(text);
}

export function hexToHsv(hex: string) {
  const parsed = parseHex(hex);
  if (!parsed) return { h: 0, s: 0, v: 0 };
  const r = Number.parseInt(parsed.hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(parsed.hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(parsed.hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex(h: number, s: number, v: number) {
  const hue = ((h % 360) + 360) % 360;
  const chroma = clamp(v, 0, 1) * clamp(s, 0, 1);
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = clamp(v, 0, 1) - chroma;
  const [r, g, b] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${byte((r + m) * 255)}${byte((g + m) * 255)}${byte((b + m) * 255)}`;
}

export function colorTextFromPicker(hex: string, alpha: number) {
  const rgb = hex.trim().toLowerCase();
  const alphaByte = Math.round(clamp(alpha, 0, 1) * 255);
  return alphaByte >= 255
    ? rgb
    : `${rgb}${alphaByte.toString(16).padStart(2, "0")}`;
}

export function cssColors(state: EditorState): CssColor[] {
  const tree =
    ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  const colors: CssColor[] = [];
  tree.iterate({
    enter(node) {
      if (node.name === "ColorLiteral" || node.name === "ValueName") {
        const source = state.doc.sliceString(node.from, node.to);
        const parsed = parseColor(source);
        if (parsed) colors.push({ from: node.from, to: node.to, source, ...parsed });
        return;
      }
      if (node.name !== "CallExpression") return;
      const callee = node.node.getChild("Callee");
      if (!callee) return;
      const name = state.doc.sliceString(callee.from, callee.to).toLowerCase();
      if (name !== "rgb" && name !== "rgba" && name !== "hsl" && name !== "hsla")
        return;
      const source = state.doc.sliceString(node.from, node.to);
      const parsed = parseColor(source);
      if (parsed) colors.push({ from: node.from, to: node.to, source, ...parsed });
      return false;
    },
  });
  return colors;
}

class ColorSwatch extends WidgetType {
  private panel: HTMLDivElement | null = null;
  private scrollTarget: HTMLElement | null = null;
  private onScroll: (() => void) | null = null;
  private applying = false;
  private dead = false;
  constructor(readonly color: CssColor) {
    super();
  }
  eq(other: ColorSwatch) {
    return (
      other.color.from === this.color.from &&
      other.color.to === this.color.to &&
      other.color.source === this.color.source
    );
  }
  ignoreEvent() {
    return true;
  }
  destroy() {
    this.dead = true;
    if (this.scrollTarget && this.onScroll)
      this.scrollTarget.removeEventListener("scroll", this.onScroll);
    this.panel?.remove();
    this.panel = null;
  }
  toDOM(view: EditorView) {
    const color = this.color;
    const swatch = document.createElement("span");
    swatch.className = "cm-color-swatch";
    const button = document.createElement("button");
    button.type = "button";
    button.style.setProperty("--cm-color", color.css);
    button.setAttribute("aria-label", `Edit color ${color.source}`);
    // WebKitGTK maps input[type=color] onto a GtkColorSwatch dialog that
    // aborts the process when its icon fails to load.
    const panel = document.createElement("div");
    panel.className = "cm-color-picker";
    panel.popover = "auto";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Edit color");
    const field = document.createElement("div");
    field.className = "cm-color-field";
    field.tabIndex = 0;
    field.setAttribute("role", "application");
    field.setAttribute("aria-label", "Saturation and brightness");
    const thumb = document.createElement("span");
    thumb.className = "cm-color-thumb";
    field.append(thumb);
    const hue = document.createElement("input");
    hue.className = "cm-color-hue";
    hue.type = "range";
    hue.min = "0";
    hue.max = "360";
    hue.step = "1";
    hue.setAttribute("aria-label", "Hue");
    const hexInput = document.createElement("input");
    hexInput.className = "cm-color-hex";
    hexInput.type = "text";
    hexInput.spellcheck = false;
    hexInput.maxLength = 7;
    hexInput.autocomplete = "off";
    hexInput.setAttribute("aria-label", "Hex color");
    panel.append(field, hue, hexInput);
    let hsv = hexToHsv(color.hex);
    const paint = (keepHexText = false) => {
      const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
      const preview = colorTextFromPicker(hex, color.alpha);
      button.style.setProperty("--cm-color", preview);
      field.style.setProperty("--cm-hue", `hsl(${hsv.h} 100% 50%)`);
      thumb.style.left = `${hsv.s * 100}%`;
      thumb.style.top = `${(1 - hsv.v) * 100}%`;
      hue.value = String(Math.round(hsv.h));
      if (!keepHexText) hexInput.value = hex;
      field.setAttribute("aria-valuetext", preview);
    };
    const apply = () => {
      if (this.applying || this.dead || !view.dom.isConnected) return;
      const insert = colorTextFromPicker(
        hsvToHex(hsv.h, hsv.s, hsv.v),
        color.alpha,
      );
      const { from, to, source } = color;
      if (view.state.doc.sliceString(from, to) !== source || insert === source)
        return;
      this.applying = true;
      try {
        view.dispatch({ changes: { from, to, insert } });
      } finally {
        this.applying = false;
      }
    };
    const place = () => {
      const rect = button.getBoundingClientRect();
      const margin = 6;
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      let left = rect.left;
      let top = rect.bottom + margin;
      if (left + width > window.innerWidth - 8)
        left = window.innerWidth - width - 8;
      if (left < 8) left = 8;
      if (top + height > window.innerHeight - 8)
        top = Math.max(8, rect.top - height - margin);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    panel.addEventListener("toggle", (event) => {
      const state = (event as ToggleEvent).newState;
      if (state === "open") {
        paint();
        place();
        return;
      }
      apply();
    });
    const setFromPointer = (event: PointerEvent) => {
      const rect = field.getBoundingClientRect();
      hsv = {
        h: hsv.h,
        s: clamp((event.clientX - rect.left) / rect.width, 0, 1),
        v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
      };
      paint();
    };
    field.addEventListener("pointerdown", (event) => {
      field.setPointerCapture(event.pointerId);
      setFromPointer(event);
    });
    field.addEventListener("pointermove", (event) => {
      if (field.hasPointerCapture(event.pointerId)) setFromPointer(event);
    });
    field.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 0.1 : 0.02;
      if (event.key === "ArrowLeft") hsv = { ...hsv, s: clamp(hsv.s - step, 0, 1) };
      else if (event.key === "ArrowRight")
        hsv = { ...hsv, s: clamp(hsv.s + step, 0, 1) };
      else if (event.key === "ArrowDown")
        hsv = { ...hsv, v: clamp(hsv.v - step, 0, 1) };
      else if (event.key === "ArrowUp")
        hsv = { ...hsv, v: clamp(hsv.v + step, 0, 1) };
      else return;
      event.preventDefault();
      paint();
    });
    hue.addEventListener("input", () => {
      hsv = { ...hsv, h: Number(hue.value) };
      paint();
    });
    hexInput.addEventListener("input", () => {
      const value = hexInput.value.trim();
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      hsv = hexToHsv(value);
      paint(true);
    });
    this.onScroll = () => {
      if (panel.matches(":popover-open")) place();
    };
    this.scrollTarget = view.scrollDOM;
    view.scrollDOM.addEventListener("scroll", this.onScroll);
    document.body.append(panel);
    button.popoverTargetElement = panel;
    this.panel = panel;
    paint();
    swatch.append(button);
    return swatch;
  }
}

function colorDecorations(state: EditorState) {
  return Decoration.set(
    cssColors(state).map((color) =>
      Decoration.widget({ widget: new ColorSwatch(color), side: -1 }).range(
        color.from,
      ),
    ),
    true,
  );
}

export const cssColorPicker = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = colorDecorations(view.state);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = colorDecorations(update.state);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
