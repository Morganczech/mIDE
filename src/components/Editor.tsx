import { useLayoutEffect, type MutableRefObject } from "react";
import { EditorView } from "@codemirror/view";
import { fontStack } from "../lib/appearance";
import { editorFontSize } from "../editor/config";
import type { OpenDocument } from "../lib/documents";

export function Editor({
  document,
  fontSize,
  fontFamily,
  viewRef,
  changed,
}: {
  document: OpenDocument;
  fontSize: number;
  fontFamily: string;
  viewRef: MutableRefObject<EditorView | null>;
  changed: () => void;
}) {
  useLayoutEffect(() => {
    const parent = window.document.getElementById("editor-host")!;
    const view = new EditorView({
      state: document.state,
      parent,
      dispatchTransactions(transactions, editor) {
        editor.update(transactions);
        document.state = editor.state;
        if (
          transactions.some(
            (transaction) => transaction.docChanged || transaction.selection,
          )
        )
          changed();
      },
    });
    view.scrollDOM.scrollTop = document.scrollTop;
    view.scrollDOM.scrollLeft = document.scrollLeft;
    viewRef.current = view;
    if (import.meta.env.VITE_NATIVE_SMOKE === "1")
      (window as unknown as { __mideView: EditorView }).__mideView = view;
    view.focus();
    return () => {
      document.state = view.state;
      document.scrollTop = view.scrollDOM.scrollTop;
      document.scrollLeft = view.scrollDOM.scrollLeft;
      view.destroy();
      viewRef.current = null;
    };
  }, [document.id]);
  useLayoutEffect(() => {
    // Reconfiguring the theme tells CodeMirror to recalculate every line and
    // gutter height. A CSS-only change leaves cached line heights behind.
    viewRef.current?.dispatch({
      effects: editorFontSize.reconfigure(
        EditorView.theme({
          "&": { fontSize: `${fontSize}px` },
          ".cm-scroller": { fontFamily: fontStack(fontFamily, "editor") },
        }),
      ),
    });
  }, [fontSize, fontFamily, document.id]);
  return <div id="editor-host" className="editor-host" />;
}
