export const defaultInterfaceFont =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const defaultEditorFont =
  '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

export function normalizeFont(value: string): string {
  const name = value.trim();
  return name.length <= 100 && !/[\x00-\x1f\x7f]/.test(name) ? name : "";
}
export function fontStack(name: string, kind: "interface" | "editor"): string {
  const fallback =
    kind === "interface" ? defaultInterfaceFont : defaultEditorFont;
  const value = normalizeFont(name);
  if (!value) return fallback;
  const generic = ["system-ui", "sans-serif", "serif", "monospace"].includes(
    value,
  );
  const family = generic
    ? value
    : `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `${family}, ${fallback}`;
}
