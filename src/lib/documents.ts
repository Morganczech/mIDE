import type { Compartment, EditorState, Text } from "@codemirror/state";
import { createEditorState } from "../editor/config";
import type { FileData } from "./backend";
interface FileTab {
  id: number;
  path: string;
}
export interface ImageDocument extends FileTab {
  kind: "image";
}
export interface TextDocument extends FileTab {
  kind: "text";
  state: EditorState;
  language: Compartment;
  saved: Text;
  revision: string;
  bom: boolean;
  lineEnding: "LF" | "CRLF";
  scrollTop: number;
  scrollLeft: number;
}
export type OpenDocument = TextDocument | ImageDocument;
let nextId = 0;
export function openImageDocument(path: string): ImageDocument {
  return { id: ++nextId, path, kind: "image" };
}
export function openDocument(path: string, data: FileData): TextDocument {
  const { state, language } = createEditorState(
    data.text,
    path,
    data.lineEnding,
  );
  return {
    kind: "text",
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
  return doc.kind !== "image" && !doc.state.doc.eq(doc.saved);
}
export function documentText(doc: TextDocument) {
  return doc.state.sliceDoc();
}
