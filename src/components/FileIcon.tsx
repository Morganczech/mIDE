import type { CSSProperties } from "react";
import javascript from "../assets/file-icons/javascript.svg";
import typescript from "../assets/file-icons/typescript.svg";
import html from "../assets/file-icons/html5.svg";
import css from "../assets/file-icons/css3.svg";
import react from "../assets/file-icons/react.svg";
import astro from "../assets/file-icons/astro.svg";
import json from "../assets/file-icons/json.svg";
import markdown from "../assets/file-icons/markdown.svg";

// Selected Devicon v2.17.0 silhouettes, rendered as monochrome masks.
const icons: Record<string, string> = {
  js: javascript,
  mjs: javascript,
  cjs: javascript,
  ts: typescript,
  mts: typescript,
  cts: typescript,
  jsx: react,
  tsx: react,
  html,
  htm: html,
  css,
  astro,
  json,
  md: markdown,
  mdx: markdown,
  markdown,
};

export function FileIcon({
  path,
  directory = false,
  open = false,
}: {
  path: string;
  directory?: boolean;
  open?: boolean;
}) {
  const name = path.split("/").pop() ?? "";
  const extension = name.includes(".")
    ? name.split(".").pop()!.toLowerCase()
    : "";
  const icon =
    !directory && Object.hasOwn(icons, extension)
      ? icons[extension]
      : undefined;
  if (icon)
    return (
      <span
        aria-hidden="true"
        className="file-icon file-type-icon"
        style={{ "--file-icon-url": `url("${icon}")` } as CSSProperties}
      />
    );
  return (
    <svg
      className="file-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      {directory ? (
        open ? (
          <path d="M2 6V3.5h4l1.5 1.5H14v2M2 13h11l2-6H4z" />
        ) : (
          <path d="M2 13V3.5h4l1.5 1.5H14v8z" />
        )
      ) : (
        <path d="M3.5 1.5h5l4 4v9h-9zM8.5 1.5v4h4" />
      )}
    </svg>
  );
}
