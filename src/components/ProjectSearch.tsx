import { useEffect, useRef, useState } from "react";
import {
  backend,
  errorMessage,
  type ProjectMatch,
  type ProjectSearchResults,
} from "../lib/backend";
import { FileIcon } from "./FileIcon";

export function ProjectSearch({
  buffers,
  select,
  close,
}: {
  buffers: () => { path: string; text: string }[];
  select: (match: ProjectMatch) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProjectSearchResults | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    const element = dialog.current!;
    element.showModal();
    input.current?.focus();
    return () => {
      mounted.current = false;
      request.current++;
      element.close();
    };
  }, []);
  const search = async () => {
    if (!query || running.current) return;
    running.current = true;
    const id = ++request.current;
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const result = await backend.search(query, buffers());
      if (id === request.current) setResults(result);
    } catch (error) {
      if (id === request.current) setError(errorMessage(error));
    } finally {
      running.current = false;
      if (mounted.current) setLoading(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="project-search-dialog"
      aria-labelledby="project-search-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="project-search-title">Find in Project</h2>
      <form
        className="project-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          ref={input}
          type="search"
          aria-label="Find in project"
          placeholder="Find text…"
          value={query}
          onChange={(event) => {
            request.current++;
            setResults(null);
            setError("");
            setQuery(event.target.value);
          }}
        />
        <button disabled={!query || loading} type="submit">
          Search
        </button>
      </form>
      <p className="search-note">
        Literal text, case-insensitive. Includes unsaved open files. Skips
        dependency and build folders, symlinks and non-text files.
      </p>
      <p role="status" className="search-summary">
        {loading
          ? "Searching…"
          : results
            ? `${results.matches.length}${results.truncated ? "+" : ""} matches in ${new Set(results.matches.map((match) => match.path)).size} files`
            : "Enter text and press Enter to search."}
        {results?.truncated && " Search limit reached; narrow your search."}
        {!!results?.skipped &&
          ` ${results.skipped} unreadable, binary, linked or oversized entries skipped.`}
      </p>
      {error && <p role="alert">{error}</p>}
      <ul className="project-search-results" aria-label="Search results">
        {results?.matches.map((match, index) => (
          <li key={index}>
            <button onClick={() => select(match)}>
              <span className="search-result-location">
                <FileIcon path={match.path} />
                <span>
                  {match.path}:{match.line}:{match.column}
                </span>
              </span>
              <span className="search-result-preview">{match.preview}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="dialog-actions">
        <button onClick={close}>Close</button>
      </div>
    </dialog>
  );
}
