import type { OpenDocument } from "../lib/documents";
import { isDirty } from "../lib/documents";
import { FileIcon } from "./FileIcon";
export function Tabs({
  documents,
  active,
  select,
  close,
}: {
  documents: OpenDocument[];
  active: number | null;
  select: (id: number) => void;
  close: (id: number) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Open files">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className={`tab ${active === doc.id ? "active" : ""}`}
        >
          <button
            role="tab"
            aria-selected={active === doc.id}
            aria-controls={doc.kind === "image" ? "image-host" : "editor-host"}
            title={doc.path + (doc.kind === "image" ? " (image preview)" : "")}
            onClick={() => select(doc.id)}
          >
            <FileIcon path={doc.path} />
            <span className="tab-filename">{doc.path.split("/").pop()}</span>
            {doc.kind === "image" && <span className="tab-kind">Preview</span>}
            {isDirty(doc) && (
              <span className="dirty" aria-label="Unsaved changes" />
            )}
          </button>
          <button
            className="close-tab"
            aria-label={`Close ${doc.path}`}
            onClick={() => close(doc.id)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
