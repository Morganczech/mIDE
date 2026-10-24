import type { Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { syntaxTree, ensureSyntaxTree } from "@codemirror/language";
import { undo, redo } from "@codemirror/commands";
import { openDocument, documentText, isDirty } from "../src/lib/documents";
import { createEditorState } from "../src/editor/config";
import { isWithin, validName } from "../src/lib/backend";

describe("manual editor", () => {
  it("preserves CRLF, independent history and dirty state", () => {
    const a = openDocument("a.ts", {
      text: "let a = 1;\r\n",
      revision: "1",
      bom: true,
      lineEnding: "CRLF",
    });
    const b = openDocument("b.ts", {
      text: "let b = 2;",
      revision: "2",
      bom: false,
      lineEnding: "LF",
    });
    a.state = a.state.update({
      changes: { from: 8, to: 9, insert: "3" },
    }).state;
    expect(documentText(a)).toBe("let a = 3;\r\n");
    expect(isDirty(a)).toBe(true);
    expect(isDirty(b)).toBe(false);
    const target = {
      get state() {
        return a.state;
      },
      dispatch: (tr: Transaction) => {
        a.state = tr.state;
      },
    };
    expect(undo(target)).toBe(true);
    expect(isDirty(a)).toBe(false);
    expect(redo(target)).toBe(true);
  });
  it.each([
    ["a.html", "<main>Hello</main>"],
    ["a.css", "main { color: red; }"],
    ["a.js", "const a = 1;"],
    ["a.ts", "const a: number = 1;"],
    ["a.jsx", "const a = <h1>Hello</h1>;"],
    ["a.tsx", "const a: Node = <h1>Hello</h1>;"],
    ["a.json", '{"a": 1}'],
    ["a.md", "# Hello"],
  ])("parses %s", (path, text) => {
    const { state } = createEditorState(text, path, "LF");
    const tree = ensureSyntaxTree(state, state.doc.length, 1000)!;
    expect(tree.length).toBe(text.length);
    expect(tree.toString()).not.toContain("⚠");
  });
  it("parses Astro frontmatter, components, expressions, script and style", () => {
    const text =
      '---\nconst title: string = "Hello";\n---\n<Header title={title} />\n<main><h1>{title}</h1></main>\n<script>const count = 1;</script>\n<style>main { color: red; }</style>';
    const { state } = createEditorState(text, "index.astro", "LF");
    const tree =
      ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
    expect(tree.length).toBe(text.length);
    expect(tree.toString()).not.toContain("⚠");
    expect(tree.resolveInner(text.indexOf("title:") + 1).name).toBe(
      "VariableDefinition",
    );
    expect(tree.resolveInner(text.indexOf("count =") + 1).name).toBe(
      "VariableDefinition",
    );
    expect(tree.resolveInner(text.indexOf("color:") + 1).name).toBe(
      "PropertyName",
    );
  });
  it("validates names and directory boundaries", () => {
    expect(validName("../file")).toBe(false);
    expect(validName("")).toBe(false);
    expect(validName("žluťoučký.ts")).toBe(true);
    expect(isWithin("src/a.ts", "src")).toBe(true);
    expect(isWithin("src-other/a.ts", "src")).toBe(false);
  });
});
