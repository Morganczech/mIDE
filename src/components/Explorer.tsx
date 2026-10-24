import { useEffect, useState, useRef } from "react";
import { backend, errorMessage, type Entry } from "../lib/backend";
import { FileIcon } from "./FileIcon";
export type FileAction = "file" | "folder" | "rename" | "delete" | "refresh";
interface Props {
  version: number;
  activePath?: string;
  open: (path: string) => void;
  action: (action: FileAction, entry: Entry | null) => void;
  error: (message: string) => void;
}
function Arrow({ open }: { open: boolean }) {
  return (
    <svg
      className={`arrow ${open ? "expanded" : ""}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
}
function Directory({
  path,
  depth,
  props,
}: {
  path: string;
  depth: number;
  props: Props & { menu: (entry: Entry, x: number, y: number) => void };
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    backend
      .list(path)
      .then((value) => {
        if (alive) setEntries(value);
      })
      .catch((error) => {
        if (alive) props.error(errorMessage(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, props.version]);
  return (
    <div
      role={depth ? "group" : "tree"}
      aria-label={depth ? undefined : "Project files"}
    >
      {loading && <div className="tree-note">Loading…</div>}
      {!loading && entries.length === 0 && (
        <div className="tree-note" style={{ paddingLeft: depth * 16 + 14 }}>
          Empty folder
        </div>
      )}
      {entries.map((entry) => (
        <div key={entry.path} role="none">
          <button
            role="treeitem"
            aria-level={depth + 1}
            aria-selected={props.activePath === entry.path}
            aria-expanded={
              entry.isDirectory ? expanded.has(entry.path) : undefined
            }
            className={`tree-row ${props.activePath === entry.path ? "selected" : ""}`}
            style={{ paddingLeft: depth * 16 + 12 }}
            onClick={() =>
              entry.isDirectory
                ? setExpanded((previous) => {
                    const next = new Set(previous);
                    if (next.has(entry.path)) next.delete(entry.path);
                    else next.add(entry.path);
                    return next;
                  })
                : props.open(entry.path)
            }
            onContextMenu={(event) => {
              event.preventDefault();
              props.menu(entry, event.clientX, event.clientY);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "ContextMenu" ||
                (event.shiftKey && event.key === "F10")
              ) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                props.menu(entry, rect.left + 20, rect.bottom);
              }
              if (
                entry.isDirectory &&
                (event.key === "ArrowRight" || event.key === "ArrowLeft")
              ) {
                event.preventDefault();
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (event.key === "ArrowRight") next.add(entry.path);
                  else next.delete(entry.path);
                  return next;
                });
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const rows = [
                  ...event.currentTarget
                    .closest("aside")!
                    .querySelectorAll<HTMLButtonElement>("[role=treeitem]"),
                ];
                rows[
                  rows.indexOf(event.currentTarget) +
                    (event.key === "ArrowDown" ? 1 : -1)
                ]?.focus();
              }
            }}
          >
            {entry.isDirectory ? (
              <Arrow open={expanded.has(entry.path)} />
            ) : (
              <span className="file-spacer" />
            )}
            <FileIcon
              path={entry.name}
              directory={entry.isDirectory}
              open={expanded.has(entry.path)}
            />
            <span className="filename">{entry.name}</span>
            {entry.isSymlink && <span className="link-label">link</span>}
          </button>
          {entry.isDirectory && expanded.has(entry.path) && (
            <Directory path={entry.path} depth={depth + 1} props={props} />
          )}
        </div>
      ))}
    </div>
  );
}
export function Explorer(props: Props & { name: string }) {
  const [menu, setMenu] = useState<{
    entry: Entry | null;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu) menuRef.current?.querySelector("button")?.focus();
  }, [menu]);
  const actions: [FileAction, string][] = [
    ["file", "New File"],
    ["folder", "New Folder"],
    ...(menu?.entry
      ? ([
          ["rename", "Rename"],
          ["delete", "Delete"],
        ] as [FileAction, string][])
      : []),
    ["refresh", "Refresh"],
  ];
  return (
    <aside className="explorer" aria-label="Explorer">
      <header>
        <span>Explorer</span>
        <button
          aria-label="Project actions"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ entry: null, x: rect.left, y: rect.bottom });
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      </header>
      <div className="project-name" title={props.name}>
        {props.name}
      </div>
      <div className="tree-scroll">
        <Directory
          path=""
          depth={0}
          props={{ ...props, menu: (entry, x, y) => setMenu({ entry, x, y }) }}
        />
      </div>
      {menu && (
        <div className="menu-dismiss" onMouseDown={() => setMenu(null)}>
          <div
            className="context-menu"
            role="menu"
            ref={menuRef}
            style={{
              left: Math.min(menu.x, window.innerWidth - 190),
              top: Math.min(menu.y, window.innerHeight - 220),
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenu(null);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const buttons = [
                  ...menuRef.current!.querySelectorAll("button"),
                ];
                const index = buttons.indexOf(
                  window.document.activeElement as HTMLButtonElement,
                );
                buttons[
                  (index +
                    (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                    buttons.length
                ].focus();
              }
            }}
          >
            {actions.map(([action, label]) => (
              <button
                key={action}
                role="menuitem"
                onClick={() => {
                  props.action(action, menu.entry);
                  setMenu(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
