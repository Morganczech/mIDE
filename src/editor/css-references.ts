import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { cssLanguage } from "@codemirror/lang-css";
import { cssDocumentation } from "./css-docs";
export interface CssReference {
  from: number;
  to: number;
  type: "css";
  value: string;
}
export function cssReferences(
  state: EditorState,
  path: string,
  from = 0,
  to = state.doc.length,
): CssReference[] {
  if (!/\.(css|html?|astro|jsx|tsx)$/i.test(path)) return [];
  const found: CssReference[] = [];
  const add = (start: number, end: number) => {
    const value = state.doc.sliceString(start, end).toLowerCase();
    if (Object.hasOwn(cssDocumentation, value))
      found.push({ from: start, to: end, type: "css", value });
  };
  syntaxTree(state).iterate({
    from,
    to,
    enter(ref) {
      const node = ref.node;
      if (node.name === "PropertyName" && node.parent?.name === "Declaration")
        add(node.from, node.to);
      if (
        node.name !== "Attribute" ||
        !node.firstChild ||
        !node.lastChild ||
        state.doc
          .sliceString(node.firstChild.from, node.firstChild.to)
          .toLowerCase() !== "style"
      )
        return;
      const attribute = node.lastChild;
      if (
        !["AttributeValue", "UnquotedAttributeValue"].includes(attribute.name)
      )
        return;
      const raw = state.doc.sliceString(attribute.from, attribute.to);
      const quote = /^["']/.test(raw) ? 1 : 0;
      if (quote && raw.at(-1) !== raw[0]) return;
      const text = quote ? raw.slice(1, -1) : raw;
      if (text.startsWith("{")) return;
      const offset = attribute.from + quote - 2;
      cssLanguage.parser.parse(`a{${text}}`).iterate({
        enter(property) {
          if (
            property.name === "PropertyName" &&
            property.node.parent?.name === "Declaration"
          )
            add(offset + property.from, offset + property.to);
        },
      });
    },
  });
  return found.filter((ref) => ref.to >= from && ref.from <= to);
}
