import { registerMdxReferences } from "./image-references";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { astroLanguage } from "@fazelstudio/codemirror-lang-astro";
import type { Extension } from "@codemirror/state";

let mdx: Extension | undefined;
export async function prepareLanguage(path: string): Promise<void> {
  if (path.split(".").pop()?.toLowerCase() === "mdx" && !mdx) {
    const module = await import("./mdx");
    mdx = module.mdxLanguage;
    registerMdxReferences(module.mdxMarkupRanges);
  }
}

export function languageFor(path: string): Extension {
  switch (path.split(".").pop()?.toLowerCase()) {
    case "html":
    case "htm":
      return html({ autoCloseTags: false, matchClosingTags: false }).language;
    case "css":
      return css().language;
    case "js":
    case "mjs":
    case "cjs":
      return javascript().language;
    case "jsx":
      return javascript({ jsx: true }).language;
    case "ts":
      return javascript({ typescript: true }).language;
    case "tsx":
      return javascript({ typescript: true, jsx: true }).language;
    case "astro":
      return astroLanguage;
    case "json":
      return json().language;
    case "mdx":
      return mdx ?? [];
    case "md":
    case "markdown":
      return markdown().language;
    default:
      return [];
  }
}
