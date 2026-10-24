import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  keymap,
  lineNumbers,
  highlightSpecialChars,
  highlightActiveLine,
  highlightActiveLineGutter,
} from "@codemirror/view";
import {
  bracketMatching,
  indentUnit,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import { findExtensions } from "./find";
import { languageFor } from "./languages";

export const editorFontSize = new Compartment();

export const syntaxStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier], color: "var(--syntax-keyword)" },
  { tag: [tags.string, tags.attributeValue], color: "var(--syntax-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--syntax-number)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  {
    tag: [tags.tagName, tags.typeName, tags.className],
    color: "var(--syntax-type)",
  },
  {
    tag: [
      tags.attributeName,
      tags.propertyName,
      tags.function(tags.variableName),
    ],
    color: "var(--syntax-property)",
  },
  { tag: [tags.heading, tags.strong], fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
]);
export function createEditorState(
  text: string,
  path: string,
  lineEnding: string,
) {
  const language = new Compartment();
  const state = EditorState.create({
    doc: text,
    extensions: [
      EditorState.lineSeparator.of(lineEnding === "CRLF" ? "\r\n" : "\n"),
      editorFontSize.of(EditorView.theme({ "&": { fontSize: "14px" } })),
      findExtensions,
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      drawSelection(),
      history(),
      bracketMatching(),
      indentUnit.of("  "),
      syntaxHighlighting(syntaxStyle),
      language.of(languageFor(path)),
      keymap.of([
        { key: "Enter", run: insertNewlineAndIndent },
        indentWithTab,
        ...historyKeymap,
        ...defaultKeymap.filter((binding) => binding.key !== "Mod-Enter"),
      ]),
      EditorView.contentAttributes.of({
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Code editor",
      }),
      EditorView.theme({
        "&": { height: "100%" },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: "var(--font-code)",
          lineHeight: "1.65",
        },
        ".cm-content": { padding: "18px 0" },
        ".cm-line": { padding: "0 24px 0 12px" },
        ".cm-gutters": { minWidth: "52px" },
        "&.cm-focused": { outline: "none" },
      }),
    ],
  });
  return { state, language };
}
