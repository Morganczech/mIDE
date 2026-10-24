import { colorKeys, type CustomTheme } from "./themes";

export type OmarchyVariant = "original" | "darker" | "contrast";
export interface OmarchySource {
  name: string;
  mode: "dark" | "light";
  colors: Record<string, string>;
}
const required = [
  "mode",
  "accent",
  "selection",
  "muted",
  "background",
  "dark_background",
  "darker_background",
  "lighter_background",
  "foreground",
  "dark_foreground",
  "light_foreground",
  "bright_foreground",
  "red",
  "yellow",
  "orange",
  "green",
  "cyan",
  "blue",
  "magenta",
  "bright_red",
  "bright_yellow",
  "bright_green",
  "bright_cyan",
  "bright_blue",
  "bright_magenta",
] as const;

export function humanizeSlug(slug: string) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
function channels(hex: string) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}
function mix(base: string, tint: string) {
  const left = channels(base);
  const right = channels(tint);
  const value = left.map((channel, index) =>
    Math.round(channel * 0.85 + right[index] * 0.15)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${value.join("")}`;
}
export function mapOmarchyTheme(
  source: OmarchySource,
  variant: OmarchyVariant,
): CustomTheme {
  for (const key of required) {
    const value = source.colors[key];
    if (
      !value ||
      (key === "mode"
        ? value !== "dark" && value !== "light"
        : !/^#[0-9a-f]{6}$/i.test(value))
    )
      throw new Error("Omarchy theme file is invalid.");
  }
  if (source.mode !== source.colors.mode)
    throw new Error("Omarchy theme file is invalid.");
  const color = (key: (typeof required)[number]) => source.colors[key];
  const surfaces =
    variant === "darker"
      ? {
          bg: color("darker_background"),
          surface: color("dark_background"),
          raised: color("background"),
        }
      : {
          bg: color("background"),
          surface: color("lighter_background"),
          raised: mix(color("lighter_background"), color("foreground")),
        };
  const colors: CustomTheme["colors"] = {
    ...surfaces,
    fg:
      variant === "contrast"
        ? color("bright_foreground")
        : color("foreground"),
    muted:
      variant === "contrast"
        ? color("light_foreground")
        : color("dark_foreground"),
    border: color("muted"),
    selection: color("selection"),
    "active-line": color("dark_background"),
    cursor: color("bright_foreground"),
    focus: color("accent"),
    "file-icon": color("blue"),
    "file-icon-active":
      source.mode === "dark" ? color("bright_blue") : color("accent"),
    "syntax-keyword": color("magenta"),
    "syntax-string": color("green"),
    "syntax-number": color("orange"),
    "syntax-comment": color("dark_foreground"),
    "syntax-type": color("yellow"),
    "syntax-property": color("cyan"),
    "terminal-black": color("dark_background"),
    "terminal-red": color("red"),
    "terminal-green": color("green"),
    "terminal-yellow": color("yellow"),
    "terminal-blue": color("blue"),
    "terminal-magenta": color("magenta"),
    "terminal-cyan": color("cyan"),
    "terminal-white": color("foreground"),
    "terminal-bright-black": color("muted"),
    "terminal-bright-red": color("bright_red"),
    "terminal-bright-green": color("bright_green"),
    "terminal-bright-yellow": color("bright_yellow"),
    "terminal-bright-blue": color("bright_blue"),
    "terminal-bright-magenta": color("bright_magenta"),
    "terminal-bright-cyan": color("bright_cyan"),
    "terminal-bright-white": color("bright_foreground"),
  };
  if (Object.keys(colors).length !== colorKeys.length)
    throw new Error("Omarchy theme file is invalid.");
  return {
    version: 1,
    name: source.name,
    variant: source.mode,
    colors,
  };
}
export function filterLibrary<
  T extends { name: string; variant: "dark" | "light" },
>(themes: T[], query: string, variant: "all" | "dark" | "light") {
  const needle = query.trim().toLowerCase();
  return themes.filter(
    (theme) =>
      (variant === "all" || theme.variant === variant) &&
      theme.name.toLowerCase().includes(needle),
  );
}
