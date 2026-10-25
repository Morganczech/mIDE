import { EditorSelection, EditorState, type Transaction } from "@codemirror/state";
import { undo } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import { createEditorState } from "../src/editor/config";
import { expandLorem } from "../src/editor/lorem";

function editor(text: string, cursor = text.length) {
  let state = createEditorState(text, "index.html", "LF").state;
  state = state.update({ selection: { anchor: cursor } }).state;
  return {
    get state() { return state; },
    dispatch(transaction: Transaction) {
      state = transaction.state;
    },
  };
}

describe("lorem expansion", () => {
  it.each(["p", "h1", "h6"])("expands inside <%s> and supports undo", (tag) => {
    const prefix = `<${tag}>`;
    const target = editor(`${prefix}lorem20</${tag}>`, prefix.length + 7);
    expect(expandLorem(target)).toBe(true);
    const content = target.state.doc.toString().slice(prefix.length, -(`</${tag}>`.length));
    expect(content.split(" ")).toHaveLength(20);
    expect(target.state.selection.main.head).toBe(prefix.length + content.length);
    expect(undo(target)).toBe(true);
    expect(target.state.doc.toString()).toBe(`${prefix}lorem20</${tag}>`);
  });

  it.each([["# lorem", 30], ["lorem1", 1], ["lorem100", 100]] as const)(
    "expands %s with the requested word count", (text, count) => {
      const target = editor(text);
      expect(expandLorem(target)).toBe(true);
      expect(target.state.doc.toString().replace(/^# /, "").split(" ")).toHaveLength(count);
    },
  );

  it.each(["hello", "mylorem20", "lorem0", "lorem10001", "lorem99999999999999999999999999999999999"])(
    "leaves Tab available for %s", (text) => {
      const target = editor(text);
      expect(expandLorem(target)).toBe(false);
      expect(target.state.doc.toString()).toBe(text);
    },
  );

  it("does not expand inside an identifier or replace selected text", () => {
    expect(expandLorem(editor("lorem20suffix", 7))).toBe(false);
    const target = editor("lorem20");
    target.dispatch(target.state.update({ selection: { anchor: 0, head: 7 } }));
    expect(expandLorem(target)).toBe(false);
  });

  it("expands multiple cursors in one transaction", () => {
    let state = EditorState.create({
      doc: "lorem1 lorem2",
      extensions: [EditorState.allowMultipleSelections.of(true)],
      selection: EditorSelection.create([EditorSelection.cursor(6), EditorSelection.cursor(13)]),
    });
    expect(expandLorem({
      state,
      dispatch(transaction) { state = transaction.state; },
    })).toBe(true);
    expect(state.doc.toString()).toBe("Lorem. Lorem ipsum.");
    expect(state.selection.ranges.map((range) => range.head)).toEqual([6, 19]);
  });
});
