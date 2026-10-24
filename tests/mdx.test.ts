import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { highlightTree, classHighlighter } from "@lezer/highlight";
import { createEditorState } from "../src/editor/config";
import { prepareLanguage } from "../src/editor/languages";
const fixture = readFileSync(
  new URL("./fixtures/sample.mdx", import.meta.url),
  "utf8",
);
beforeAll(() => prepareLanguage("sample.mdx"));
function highlights(text: string) {
  const { state } = createEditorState(text, "sample.mdx", "LF");
  const tree =
    ensureSyntaxTree(state, state.doc.length, 5000) ?? syntaxTree(state);
  const tokens: { text: string; classes: string; from: number; to: number }[] =
    [];
  highlightTree(tree, classHighlighter, (from, to, classes) =>
    tokens.push({ text: state.sliceDoc(from, to), classes, from, to }),
  );
  return { state, tokens };
}
describe("MDX highlighting only", () => {
  it("highlights frontmatter, Markdown, ESM, JSX, expressions and web code fences", () => {
    const { state, tokens } = highlights(fixture);
    const has = (value: string, kind: string) =>
      tokens.some(
        (token) => token.text.includes(value) && token.classes.includes(kind),
      );
    expect(has("import", "keyword")).toBe(true);
    expect(has("export", "keyword")).toBe(true);
    expect(has("Hello MDX", "string")).toBe(true);
    expect(has("Hello", "heading")).toBe(true);
    expect(has("**", "strong")).toBe(true);
    expect(has("*", "emphasis")).toBe(true);
    expect(has("Card", "typeName")).toBe(true);
    expect(has("title", "propertyName")).toBe(true);
    expect(has("42", "number")).toBe(true);
    expect(has("color", "propertyName")).toBe(true);
    expect(state.doc.toString()).toBe(fixture);
    expect(state.languageDataAt("autocomplete", 0)).toEqual([]);
  });
  it.each([
    ["html", "<main>Hello</main>", "main", "typeName"],
    ["js", "const value = 42", "const", "keyword"],
    ["ts", "const value: string = 'Hello'", "const", "keyword"],
    ["jsx", "<Card count={42} />", "Card", "typeName"],
    ["tsx", "<Card count={42} />", "Card", "typeName"],
    ["json", '{"value": 42}', "42", "number"],
    ["md", "# Heading", "Heading", "heading"],
  ])("highlights supported %s code fences", (language, source, value, kind) => {
    const { tokens } = highlights("```" + language + "\n" + source + "\n```\n");
    expect(
      tokens.some(
        (token) => token.text.includes(value) && token.classes.includes(kind),
      ),
    ).toBe(true);
  });
  it("recovers highlighting while JSX is unfinished and after editing frontmatter", () => {
    const { state } = highlights(fixture);
    const edited = state.update({
      changes: {
        from: fixture.indexOf("title:"),
        insert: "description: Test\n",
      },
    }).state;
    const tree = ensureSyntaxTree(edited, edited.doc.length, 5000)!;
    const tokens: string[] = [];
    highlightTree(tree, classHighlighter, (from, to) =>
      tokens.push(edited.sliceDoc(from, to)),
    );
    expect(tokens.some((token) => token.includes("import"))).toBe(true);
    const partial = highlights('# Title\n\n<Card title={"Hello"}\n');
    expect(partial.tokens.some((token) => token.text.includes("Card"))).toBe(
      true,
    );
  });
});
