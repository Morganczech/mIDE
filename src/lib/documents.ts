import type { Compartment, EditorState, Text } from "@codemirror/state";
import { createEditorState } from "../editor/config";
import type { FileData } from "./backend";
export interface OpenDocument {
  id: number;
  path: string;
  state: EditorState;
  language: Compartment;
  saved: Text;
  revision: string;
  bom: boolean;
  lineEnding: "LF" | "CRLF";
  scrollTop: number;
  scrollLeft: number;
}
let nextId = 0;
export function openDocument(path: string, data: FileData): OpenDocument {
  const { state, language } = createEditorState(
    data.text,
    path,
    data.lineEnding,
  );
  return {
    id: ++nextId,
    path,
    state,
    language,
    saved: state.doc,
    revision: data.revision,
    bom: data.bom,
    lineEnding: data.lineEnding,
    scrollTop: 0,
    scrollLeft: 0,
  };
}
export function isDirty(doc: OpenDocument) {
  return !doc.state.doc.eq(doc.saved);
}
export function documentText(doc: OpenDocument) {
  return doc.state.sliceDoc();
}
