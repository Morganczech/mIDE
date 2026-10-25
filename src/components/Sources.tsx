import { Troubleshooting } from "./Troubleshooting";
import { findTroubleshootingGuides } from "../lib/troubleshooting";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { backend, errorMessage } from "../lib/backend";
import {
  builtinSources,
  categories,
  emptySources,
  filterSources,
  mergeSources,
  parseSources,
  saveSources,
  sourcesKey,
  validateSource,
  type Source,
  type SourceFilter,
  type SourcesState,
} from "../lib/sources";

export function Sources({ close }: { close: () => void }) {
  const [initial] = useState(() => {
    try {
      return {
        data: parseSources(
          localStorage.getItem(sourcesKey) ?? JSON.stringify(emptySources()),
        ),
        error: "",
      };
    } catch {
      return {
        data: emptySources(),
        error:
          "Saved Sources could not be read. Your stored data has been kept. Import a backup or save a new collection to replace it.",
      };
    }
  });
  const [data, setData] = useState(initial.data);
  const [error, setError] = useState(initial.error);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [filter, setFilter] = useState<SourceFilter>("All");
  const [editing, setEditing] = useState<Source | null>(null);
  const [pendingImport, setPendingImport] = useState<SourcesState | null>(null);
  const [replace, setReplace] = useState(false);
  const [deleted, setDeleted] = useState<{
    source: Source;
    favorite: boolean;
    index: number;
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const importHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (pendingImport) importHeading.current?.focus();
  }, [pendingImport]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (!deleted) return;
    const timeout = window.setTimeout(() => setDeleted(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [deleted]);
  function commit(next: SourcesState): boolean {
    try {
      saveSources(localStorage, next);
      setData(next);
      setError("");
      return true;
    } catch (reason) {
      setError(`Could not save Sources. ${errorMessage(reason)}`);
      return false;
    }
  }
  async function task(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  function edit(source?: Source) {
    setGuidesOpen(false);
    setEditing(
      source ?? {
        id: `custom-${crypto.randomUUID()}`,
        title: "",
        url: "",
        description: "",
        category: "Tools",
        tags: [],
      },
    );
    setPendingImport(null);
  }
  function remove(source: Source) {
    const index = data.customSources.findIndex((item) => item.id === source.id);
    if (
      commit({
        ...data,
        customSources: data.customSources.filter(
          (item) => item.id !== source.id,
        ),
        favoriteIds: data.favoriteIds.filter((id) => id !== source.id),
      })
    )
      setDeleted({
        source,
        index,
        favorite: data.favoriteIds.includes(source.id),
      });
  }
  const items = filterSources(data, filter, category, query);
  const formOpen = !!editing || !!pendingImport;
  return (
    <section
      className="sources-page"
      aria-labelledby="sources-heading"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          const openMenu =
            event.currentTarget.querySelector<HTMLDetailsElement>(
              "details[open]",
            );
          if (openMenu) {
            openMenu.open = false;
            openMenu.querySelector<HTMLElement>("summary")?.focus();
            return;
          }
          if (formOpen) {
            setEditing(null);
            setPendingImport(null);
            search.current?.focus();
          } else close();
        }
      }}
    >
      <div className="sources-content">
        <header className="settings-header">
          <h1 id="sources-heading" tabIndex={-1} ref={heading}>
            Sources
          </h1>
          <button onClick={close}>Back to Editor</button>
        </header>
        <p className="sources-intro">
          Documentation, troubleshooting guides, assets and tools for your next
          web project. Links open in your browser.
        </p>
        <div className="sources-toolbar">
          <input
            ref={search}
            type="search"
            aria-label="Search sources"
            placeholder={
              guidesOpen
                ? "Search troubleshooting guides"
                : "Search sources, topics or domains"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button disabled={busy} onClick={() => edit()}>
            Add source
          </button>
          <details className="sources-options">
            <summary aria-label="Collection actions">Collection</summary>
            <div>
              <button
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  void task(async () => {
                    const text = await backend.importSources();
                    if (text !== null) {
                      setPendingImport(parseSources(text));
                      setEditing(null);
                      setReplace(false);
                    }
                  });
                }}
              >
                Import JSON
              </button>
              <button
                disabled={busy}
                onClick={(event) => {
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                  void task(async () => {
                    if (
                      await backend.exportSources(JSON.stringify(data, null, 2))
                    )
                      setMessage("Sources exported.");
                  });
                }}
              >
                Export JSON
              </button>
              <button
                onClick={(event) => {
                  setGuidesOpen(false);
                  setFilter("Hidden sources");
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
              >
                Hidden sources
              </button>
            </div>
          </details>
        </div>
        {error && (
          <p className="sources-feedback" role="alert">
            {error} <button onClick={() => setError("")}>Dismiss</button>
          </p>
        )}
        {message && (
          <p className="sources-feedback" role="status">
            {message}
          </p>
        )}
        {busy && <p role="status">Working…</p>}
        {deleted && (
          <div className="sources-feedback" role="status">
            Deleted {deleted.source.title}.{" "}
            <button
              onClick={() => {
                const customSources = [...data.customSources];
                customSources.splice(
                  Math.min(deleted.index, customSources.length),
                  0,
                  deleted.source,
                );
                if (
                  commit({
                    ...data,
                    customSources,
                    favoriteIds: deleted.favorite
                      ? [...new Set([...data.favoriteIds, deleted.source.id])]
                      : data.favoriteIds,
                  })
                )
                  setDeleted(null);
              }}
            >
              Undo
            </button>
          </div>
        )}
        {editing && (
          <SourceForm
            key={editing.id}
            source={editing}
            save={(source) => {
              if (
                commit({
                  ...data,
                  customSources: data.customSources.some(
                    (item) => item.id === source.id,
                  )
                    ? data.customSources.map((item) =>
                        item.id === source.id ? source : item,
                      )
                    : [...data.customSources, source],
                })
              ) {
                setEditing(null);
                search.current?.focus();
              }
            }}
            cancel={() => {
              setEditing(null);
              search.current?.focus();
            }}
          />
        )}
        {pendingImport && (
          <section className="sources-form" aria-labelledby="import-heading">
            <h2 id="import-heading" tabIndex={-1} ref={importHeading}>
              Import collection
            </h2>
            <p>
              {pendingImport.customSources.length} custom sources,{" "}
              {pendingImport.favoriteIds.length} favorites and{" "}
              {pendingImport.hiddenBuiltinIds.length} hidden source IDs.
            </p>
            <label>
              <input
                type="radio"
                name="import-mode"
                checked={!replace}
                onChange={() => setReplace(false)}
              />{" "}
              Merge with my collection (existing entries win)
            </label>
            <label>
              <input
                type="radio"
                name="import-mode"
                checked={replace}
                onChange={() => setReplace(true)}
              />{" "}
              Replace my collection
            </label>
            {replace && (
              <p>
                This replaces your custom sources, favorites and hidden sources.
                Export a backup first if you want to keep them.
              </p>
            )}
            <div className="sources-form-actions">
              <button
                onClick={() => {
                  if (
                    commit(
                      replace
                        ? pendingImport
                        : mergeSources(data, pendingImport),
                    )
                  ) {
                    setPendingImport(null);
                    setDeleted(null);
                    setMessage("Collection imported.");
                    search.current?.focus();
                  }
                }}
              >
                {replace ? "Confirm replacement" : "Merge collection"}
              </button>
              <button
                onClick={() => {
                  setPendingImport(null);
                  search.current?.focus();
                }}
              >
                Cancel
              </button>
            </div>
          </section>
        )}
        <div className="sources-layout">
          <nav className="sources-categories" aria-label="Source categories">
            <button
              aria-pressed={guidesOpen}
              onClick={() => setGuidesOpen(true)}
            >
              <span>Troubleshooting</span>
              <span>{findTroubleshootingGuides(query).length}</span>
            </button>
            {["All categories", ...categories].map((name) => (
              <button
                key={name}
                aria-pressed={!guidesOpen && category === name}
                onClick={() => {
                  setGuidesOpen(false);
                  setCategory(name);
                }}
              >
                <span>{name}</span>
                <span>{filterSources(data, filter, name, query).length}</span>
              </button>
            ))}
          </nav>
          <div className="sources-results">
            {guidesOpen ? (
              <Troubleshooting query={query} />
            ) : (
              <>
                <div
                  className="sources-filters"
                  role="group"
                  aria-label="Source collection"
                >
                  {(["All", "Favorites", "My sources"] as SourceFilter[]).map(
                    (name) => (
                      <button
                        key={name}
                        aria-pressed={filter === name}
                        onClick={() => setFilter(name)}
                      >
                        {name}
                      </button>
                    ),
                  )}
                  {filter === "Hidden sources" && (
                    <button
                      aria-pressed="true"
                      onClick={() => setFilter("All")}
                    >
                      Hidden sources
                    </button>
                  )}
                </div>
                <p className="sources-count" role="status">
                  {items.length} {items.length === 1 ? "source" : "sources"}
                </p>
                {items.length === 0 && (
                  <div className="sources-empty">
                    <h2>
                      {query || category !== "All categories"
                        ? "No matching sources"
                        : filter === "Favorites"
                          ? "No favorites yet"
                          : filter === "My sources"
                            ? "Your collection starts here"
                            : "No hidden sources"}
                    </h2>
                    <p>
                      {filter === "Favorites"
                        ? "Use the star beside a source to keep it here."
                        : filter === "My sources"
                          ? "Add a source or save a built-in source as your own."
                          : "Try another category or clear your search."}
                    </p>
                    {(query || category !== "All categories") && (
                      <button
                        onClick={() => {
                          setQuery("");
                          setCategory("All categories");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
                <ul className="sources-list">
                  {items.map((source) => {
                    const builtin = builtinSources.some(
                      (item) => item.id === source.id,
                    );
                    const favorite = data.favoriteIds.includes(source.id);
                    return (
                      <li key={source.id} className="source-row">
                        <button
                          className="source-star"
                          aria-label={`${favorite ? "Remove" : "Add"} ${source.title} ${favorite ? "from" : "to"} favorites`}
                          aria-pressed={favorite}
                          onClick={() =>
                            commit({
                              ...data,
                              favoriteIds: favorite
                                ? data.favoriteIds.filter(
                                    (id) => id !== source.id,
                                  )
                                : [...data.favoriteIds, source.id],
                            })
                          }
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            fill={favorite ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth="1.6"
                          >
                            <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
                          </svg>
                        </button>
                        <div className="source-copy">
                          <a
                            href={source.url}
                            onClick={(event) => {
                              event.preventDefault();
                              void task(async () =>
                                backend.openSourceUrl(source.url),
                              );
                            }}
                          >
                            {source.title}
                            <span
                              className="source-external"
                              aria-hidden="true"
                            >
                              <svg
                                viewBox="0 0 16 16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.3"
                              >
                                <path d="M6 3H3v10h10v-3M9 3h4v4M7 9l6-6" />
                              </svg>
                            </span>
                          </a>
                          <span className="source-domain">
                            {new URL(source.url).hostname}
                          </span>
                          <p>{source.description}</p>
                          <div className="source-tags">
                            {source.tags.map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                            {!builtin && <span>My source</span>}
                          </div>
                        </div>
                        <details className="sources-options source-actions">
                          <summary aria-label={`Actions for ${source.title}`}>
                            Actions
                          </summary>
                          <div>
                            {builtin ? (
                              filter === "Hidden sources" ? (
                                <button
                                  onClick={() =>
                                    commit({
                                      ...data,
                                      hiddenBuiltinIds:
                                        data.hiddenBuiltinIds.filter(
                                          (id) => id !== source.id,
                                        ),
                                    })
                                  }
                                >
                                  Restore source
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={(event) => {
                                      event.currentTarget
                                        .closest("details")
                                        ?.removeAttribute("open");
                                      edit({
                                        ...source,
                                        id: `custom-${crypto.randomUUID()}`,
                                      });
                                    }}
                                  >
                                    Save as my source
                                  </button>
                                  <button
                                    onClick={() =>
                                      commit({
                                        ...data,
                                        hiddenBuiltinIds: [
                                          ...data.hiddenBuiltinIds,
                                          source.id,
                                        ],
                                      })
                                    }
                                  >
                                    Hide source
                                  </button>
                                </>
                              )
                            ) : (
                              <>
                                <button
                                  onClick={(event) => {
                                    event.currentTarget
                                      .closest("details")
                                      ?.removeAttribute("open");
                                    edit(source);
                                  }}
                                >
                                  Edit source
                                </button>
                                <button onClick={() => remove(source)}>
                                  Delete source
                                </button>
                              </>
                            )}
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceForm({
  source,
  save,
  cancel,
}: {
  source: Source;
  save: (source: Source) => void;
  cancel: () => void;
}) {
  const [error, setError] = useState("");
  const title = useRef<HTMLInputElement>(null);
  useEffect(() => {
    title.current?.focus();
    title.current?.scrollIntoView({ block: "nearest" });
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const value = validateSource({
        ...source,
        title: form.get("title"),
        url: form.get("url"),
        description: form.get("description"),
        category: form.get("category"),
        tags: String(form.get("tags"))
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      save(value);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  return (
    <form
      className="sources-form"
      onSubmit={submit}
      aria-labelledby="source-form-heading"
    >
      <h2 id="source-form-heading">
        {source.title ? "Edit source" : "Add source"}
      </h2>
      <div className="sources-form-grid">
        <label>
          Name
          <input
            ref={title}
            name="title"
            defaultValue={source.title}
            required
            maxLength={2048}
          />
        </label>
        <label>
          URL
          <input
            name="url"
            type="url"
            defaultValue={source.url}
            placeholder="https://example.com"
            required
            maxLength={2048}
          />
        </label>
        <label className="source-description-field">
          When is it useful?
          <textarea
            name="description"
            defaultValue={source.description}
            required
            maxLength={1000}
            rows={2}
          />
        </label>
        <label>
          Category
          <select name="category" defaultValue={source.category}>
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Tags, separated by commas
          <input
            name="tags"
            defaultValue={source.tags.join(", ")}
            placeholder="CSS, Layout"
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="sources-form-actions">
        <button type="submit">Save source</button>
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
