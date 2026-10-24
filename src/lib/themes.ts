export const colorKeys = [
  "bg",
  "surface",
  "raised",
  "fg",
  "muted",
  "border",
  "selection",
  "active-line",
  "cursor",
  "focus",
  "file-icon",
  "file-icon-active",
  "syntax-keyword",
  "syntax-string",
  "syntax-number",
  "syntax-comment",
  "syntax-type",
  "syntax-property",
  "terminal-black",
  "terminal-red",
  "terminal-green",
  "terminal-yellow",
  "terminal-blue",
  "terminal-magenta",
  "terminal-cyan",
  "terminal-white",
  "terminal-bright-black",
  "terminal-bright-red",
  "terminal-bright-green",
  "terminal-bright-yellow",
  "terminal-bright-blue",
  "terminal-bright-magenta",
  "terminal-bright-cyan",
  "terminal-bright-white",
] as const;
export interface CustomTheme {
  version: 1;
  name: string;
  variant: "dark" | "light";
  colors: Partial<Record<(typeof colorKeys)[number], string>>;
}
export function parseTheme(text: string): CustomTheme {
  if (text.length > 65536)
    throw new Error("Theme file must be smaller than 64 KiB.");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Theme file is not valid JSON.");
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["version", "name", "variant", "colors"].includes(key),
    ) ||
    value.version !== 1 ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.trim().length > 60 ||
    /[\x00-\x1f\x7f]/.test(value.name) ||
    !["dark", "light"].includes(value.variant) ||
    !value.colors ||
    typeof value.colors !== "object" ||
    Array.isArray(value.colors) ||
    Object.keys(value.colors).length === 0
  )
    throw new Error(
      "Expected a version 1 theme with a name, dark/light variant and colors.",
    );
  for (const [key, color] of Object.entries(value.colors)) {
    if (
      !(colorKeys as readonly string[]).includes(key) ||
      typeof color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(color)
    )
      throw new Error(
        `Invalid color '${key}'. Use a supported color name and #RRGGBB.`,
      );
  }
  return {
    version: 1,
    name: value.name.trim(),
    variant: value.variant,
    colors: { ...value.colors },
  };
}
export function loadThemes(): CustomTheme[] {
  try {
    const values = JSON.parse(
      localStorage.getItem("mide-custom-themes") ?? "[]",
    );
    if (!Array.isArray(values) || values.length > 50) return [];
    return values.map((value) => parseTheme(JSON.stringify(value)));
  } catch {
    return [];
  }
}
const darkSwatch = ["#1b1c1e", "#d49393", "#adc496", "#9bb8d2"];
const lightSwatch = ["#faf9f6", "#9f3636", "#486a32", "#355e8c"];
export function swatchColors(
  kind: "dark" | "light" | "palette",
  variant: "dark" | "light",
  colors: CustomTheme["colors"] = {},
) {
  if (kind === "dark") return darkSwatch;
  if (kind === "light") return lightSwatch;
  const fallback = variant === "light" ? lightSwatch : darkSwatch;
  return [
    colors.bg ?? fallback[0],
    colors["terminal-red"] ?? colors["syntax-keyword"] ?? fallback[1],
    colors["terminal-green"] ?? colors["syntax-string"] ?? fallback[2],
    colors["terminal-blue"] ?? colors["file-icon"] ?? fallback[3],
  ];
}
export const themeId = (theme: CustomTheme) => `custom:${theme.name}`;
export interface BuiltinTheme {
  id: string;
  theme: CustomTheme;
}
export function applyPalette(
  theme: CustomTheme,
  root = document.documentElement,
) {
  root.dataset.theme = theme.variant;
  for (const key of colorKeys) root.style.removeProperty(`--${key}`);
  for (const [key, value] of Object.entries(theme.colors))
    if (value) root.style.setProperty(`--${key}`, value);
}
export function applyTheme(
  id: string,
  themes: CustomTheme[],
  root = document.documentElement,
  builtins: BuiltinTheme[] = [],
) {
  const palette =
    builtins.find((item) => item.id === id)?.theme ??
    themes.find((theme) => themeId(theme) === id);
  root.dataset.theme = palette?.variant ?? (id === "light" ? "light" : "dark");
  for (const key of colorKeys) root.style.removeProperty(`--${key}`);
  if (!palette || id === "dark" || id === "light") return;
  for (const [key, value] of Object.entries(palette.colors))
    if (value) root.style.setProperty(`--${key}`, value);
}
