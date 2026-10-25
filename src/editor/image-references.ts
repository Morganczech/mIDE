import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { htmlLanguage } from "@codemirror/lang-html";
import type { SyntaxNode, Tree } from "@lezer/common";
import { resolveImagePath } from "../lib/images";
import { htmlDescriptions } from "./html-docs";
export interface CodeReference {
  from: number;
  to: number;
  type: "image" | "tag";
  value: string;
  path?: string;
}
let mdxRanges:
  | ((doc: EditorState["doc"], to: number) => { from: number; to: number }[])
  | undefined;
export function registerMdxReferences(parser: typeof mdxRanges) {
  mdxRanges = parser;
}
function collect(
  tree: Tree,
  text: (from: number, to: number) => string,
  path: string,
  from: number,
  to: number,
  offset = 0,
): CodeReference[] {
  const found: CodeReference[] = [];
  const read = (node: SyntaxNode) => text(node.from + offset, node.to + offset);
  tree.iterate({
    from: Math.max(0, from - offset),
    to: to - offset,
    enter(ref) {
      const node = ref.node;
      if (node.name === "TagName" || node.name === "JSXBuiltin") {
        const value = read(node);
        if (
          value === value.toLowerCase() &&
          Object.hasOwn(htmlDescriptions, value)
        )
          found.push({
            from: node.from + offset,
            to: node.to + offset,
            type: "tag",
            value,
          });
      }
      if (node.name !== "Attribute" && node.name !== "JSXAttribute") return;
      const name = node.firstChild,
        value = node.lastChild;
      if (
        !name ||
        !value ||
        !["src", "href"].includes(read(name).toLowerCase())
      )
        return;
      if (
        ![
          "AttributeValue",
          "UnquotedAttributeValue",
          "JSXAttributeValue",
        ].includes(value.name)
      )
        return;
      const tag =
        node.parent?.getChild("TagName") ?? node.parent?.getChild("JSXBuiltin");
      if (!tag || !["img", "input", "source", "link"].includes(read(tag)))
        return;
      if (read(tag) === "link") {
        let icon = false;
        for (
          let sibling = node.parent?.firstChild;
          sibling;
          sibling = sibling.nextSibling
        ) {
          if (
            ["Attribute", "JSXAttribute"].includes(sibling.name) &&
            sibling.firstChild &&
            read(sibling.firstChild).toLowerCase() === "rel" &&
            sibling.lastChild
          )
            icon =
              /(?:^|[\s"'])(?:icon|apple-touch-icon|mask-icon)(?:[\s"']|$)/i.test(
                read(sibling.lastChild),
              );
        }
        if (!icon || read(name).toLowerCase() !== "href") return;
      } else if (read(name).toLowerCase() !== "src") return;
      const raw = read(value),
        quoted = /^["']/.test(raw);
      if (raw.startsWith("{")) return;
      const source = quoted ? raw.slice(1, -1) : raw;
      const resolved = resolveImagePath(path, source);
      // Local but invalid paths still offer an explanatory hover.
      if (!source || /^(?:[a-z][\w+.-]*:|\/\/|#|@|~)/i.test(source)) return;
      found.push({
        from: value.from + offset + (quoted ? 1 : 0),
        to: value.to + offset - (quoted ? 1 : 0),
        type: "image",
        value: source,
        path: resolved ?? undefined,
      });
    },
  });
  return found;
}
export function codeReferences(
  state: EditorState,
  path: string,
  from = 0,
  to = state.doc.length,
): CodeReference[] {
  if (!/\.(html?|jsx|tsx|astro|mdx)$/i.test(path)) return [];
  const text = (a: number, b: number) => state.doc.sliceString(a, b);
  if (/\.mdx$/i.test(path)) {
    const ranges = mdxRanges?.(state.doc, to) ?? [];
    return ranges
      .filter((range) => range.to >= from && range.from <= to)
      .flatMap((range) =>
        collect(
          htmlLanguage.parser.parse(text(range.from, range.to)),
          text,
          path,
          from,
          to,
          range.from,
        ),
      );
  }
  return collect(syntaxTree(state), text, path, from, to);
}
