import { EditorSelection, type StateCommand } from "@codemirror/state";

const words = (
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor " +
  "incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis " +
  "nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat " +
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore " +
  "eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident " +
  "sunt in culpa qui officia deserunt mollit anim id est laborum"
).split(" ");

/** Expand an abbreviation immediately before each cursor, leaving Tab free otherwise. */
export const expandLorem: StateCommand = ({ state, dispatch }) => {
  const expansions = state.selection.ranges.map((range) => {
    if (!range.empty) return null;
    const before = state.sliceDoc(Math.max(0, range.head - 32), range.head);
    const match = /(?:^|[^\p{L}\p{N}_])(lorem(\d*))$/u.exec(before);
    if (!match) return null;
    // Do not expand a prefix of a larger identifier when the cursor is inside it.
    if (/^[\p{L}\p{N}_]/u.test(state.sliceDoc(range.head, range.head + 1)))
      return null;
    const count = match[2] === "" ? 30 : Number(match[2]);
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) return null;
    const text = Array.from({ length: count }, (_, i) => words[i % words.length])
      .join(" ") + ".";
    return { from: range.head - match[1].length, to: range.head, insert: text };
  });
  if (expansions.some((expansion) => expansion === null)) return false;
  let index = 0;
  dispatch(state.update(state.changeByRange(() => {
    const change = expansions[index++]!;
    return {
      changes: change,
      range: EditorSelection.cursor(change.from + change.insert.length),
    };
  }), { scrollIntoView: true, userEvent: "input" }));
  return true;
};
