import { parseTheme, type BuiltinTheme } from "./themes";

const modules = import.meta.glob("../../themes/*.json", {
  eager: true,
}) as Record<string, { default?: unknown }>;
const order = [
  "dracula",
  "one-dark",
  "nord",
  "monokai",
  "material-ocean",
  "one-light",
  "github-light",
  "solarized-light",
  "material-lighter",
];

export const builtinThemes: BuiltinTheme[] = Object.entries(modules)
  .filter(([path]) => !path.endsWith("/quiet-blue.json"))
  .map(([path, module]) => {
    const stem = path.split("/").pop()?.replace(/\.json$/, "") ?? "";
    const value =
      module && typeof module === "object" && "default" in module && module.default
        ? module.default
        : module;
    return {
      id: `builtin:${stem}`,
      theme: parseTheme(JSON.stringify(value)),
    };
  })
  .sort(
    (left, right) =>
      order.indexOf(left.id.slice("builtin:".length)) -
      order.indexOf(right.id.slice("builtin:".length)),
  );

export function themeLabel<T extends { name: string }>(
  id: string,
  custom: T[],
  customId: (theme: T) => string,
) {
  if (id === "dark") return "Dark";
  if (id === "light") return "Light";
  return (
    builtinThemes.find((item) => item.id === id)?.theme.name ??
    custom.find((item) => customId(item) === id)?.name ??
    "Dark"
  );
}
