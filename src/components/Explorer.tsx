import { createPortal } from "react-dom";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useState, useRef } from "react";
import { backend, errorMessage, type Entry } from "../lib/backend";
import { canOpenInBrowser } from "../lib/live-server";
import { FileIcon } from "./FileIcon";
export type FileAction =
  | "file"
  | "folder"
  | "rename"
  | "delete"
  | "refresh"
  | "browser"
  | "move"
  | "copy-relative"
  | "copy-absolute";
interface Props {
  move: (entry: Entry, directory: string) => void;
  importFiles: (paths: string[], directory: string) => void;
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
  props: Props & {
    menu: (entry: Entry, x: number, y: number) => void;
    startDrag: (entry: Entry, event: React.PointerEvent) => void;
  };
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
            data-path={entry.path}
            data-directory={
              entry.isDirectory
                ? entry.path
                : entry.path.includes("/")
                  ? entry.path.slice(0, entry.path.lastIndexOf("/"))
                  : ""
            }
            onPointerDown={(event) => props.startDrag(entry, event)}
            onDragStart={(event) => event.preventDefault()}
            draggable={false}
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
  const aside = useRef<HTMLElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const suppressClick = useRef(false);
  const cleanupDrag = useRef<(() => void) | undefined>(undefined);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    entry: Entry;
    valid: boolean;
  } | null>(null);
  const previewElement = useRef<HTMLDivElement>(null);
  const previewPosition = useRef({ x: 0, y: 0 });
  const positionPreview = (x: number, y: number) => {
    const width = previewElement.current?.offsetWidth ?? 240;
    const height = previewElement.current?.offsetHeight ?? 32;
    previewPosition.current = {
      x: Math.max(8, Math.min(x + 14, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y + 14, window.innerHeight - height - 8)),
    };
    if (previewElement.current)
      previewElement.current.style.transform = `translate(${previewPosition.current.x}px, ${previewPosition.current.y}px)`;
  };
  const targetAt = (x: number, y: number) => {
    const rect = aside.current?.getBoundingClientRect();
    if (
      !rect ||
      x < rect.left ||
      x >= rect.right ||
      y < rect.top ||
      y >= rect.bottom
    )
      return null;
    const element = window.document.elementFromPoint(x, y);
    if (!element || !aside.current?.contains(element)) return null;
    return (
      element.closest<HTMLElement>("[data-directory]")?.dataset.directory ?? ""
    );
  };
  useEffect(() => () => cleanupDrag.current?.(), []);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "leave") {
          setDropTarget(null);
          return;
        }
        const directory = targetAt(
          payload.position.x / window.devicePixelRatio,
          payload.position.y / window.devicePixelRatio,
        );
        setDropTarget(directory);
        if (payload.type === "drop") {
          setDropTarget(null);
          if (directory !== null)
            latest.current.importFiles(payload.paths, directory);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else stop = fn;
      })
      .catch((error) => latest.current.error(errorMessage(error)));
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  const startDrag = (entry: Entry, event: React.PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    cleanupDrag.current?.();
    suppressClick.current = false;
    const source = event.currentTarget as HTMLElement;
    const pointerId = event.pointerId;
    source.focus({ preventScroll: true });
    // WebKit can otherwise hand the gesture to its native text/drag handling.
    // Capture keeps move/up events attached to the pressed row across targets.
    source.setPointerCapture(pointerId);
    const x = event.clientX,
      y = event.clientY;
    let dragging = false;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      if (!dragging && Math.hypot(event.clientX - x, event.clientY - y) < 5)
        return;
      dragging = true;
      const destination = targetAt(event.clientX, event.clientY);
      const valid =
        destination !== null &&
        !(
          entry.isDirectory &&
          (destination === entry.path ||
            destination.startsWith(entry.path + "/"))
        );
      setDropTarget(valid ? destination : null);
      positionPreview(event.clientX, event.clientY);
      source.classList.add("drag-source");
      setDragPreview((previous) =>
        previous?.entry === entry && previous.valid === valid
          ? previous
          : { entry, valid },
      );
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      source.removeEventListener("lostpointercapture", cancel);
      if (source.hasPointerCapture(pointerId))
        source.releasePointerCapture(pointerId);
      setDropTarget(null);
      setDragPreview(null);
      source.classList.remove("drag-source");
      cleanupDrag.current = undefined;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const destination = targetAt(event.clientX, event.clientY);
      if (dragging) {
        suppressClick.current = true;
        if (
          destination !== null &&
          !(
            entry.isDirectory &&
            (destination === entry.path ||
              destination.startsWith(entry.path + "/"))
          )
        )
          latest.current.move(entry, destination);
      }
      finish();
    };
    const cancel = () => {
      suppressClick.current = dragging;
      finish();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    cleanupDrag.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    source.addEventListener("lostpointercapture", cancel);
  };
  useEffect(() => {
    aside.current
      ?.querySelectorAll<HTMLElement>("[data-directory]")
      .forEach((row) => {
        row.classList.toggle(
          "drop-target",
          dropTarget !== null &&
            row.dataset.directory === dropTarget &&
            row.getAttribute("aria-expanded") !== null,
        );
      });
  }, [dropTarget, props.version]);
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
    ...(menu?.entry && canOpenInBrowser(menu.entry)
      ? ([["browser", "Open in Browser"]] as [FileAction, string][])
      : []),
    ["file", "New File"],
    ["folder", "New Folder"],
    ...(menu?.entry
      ? ([
          ["copy-relative", "Copy Relative Path"],
          ["copy-absolute", "Copy Absolute Path"],
          ["move", "Move to…"],
          ["rename", "Rename"],
          ["delete", "Delete"],
        ] as [FileAction, string][])
      : []),
    ["refresh", "Refresh"],
  ];
  return (
    <aside
      ref={aside}
      className={`explorer ${dropTarget === "" ? "root-drop-target" : ""}`}
      aria-label="Explorer"
      onClickCapture={(event) => {
        if (suppressClick.current && event.detail !== 0) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {dragPreview &&
        createPortal(
          <div
            ref={previewElement}
            className={`explorer-drag-preview ${dragPreview.valid ? "" : "invalid"}`}
            aria-hidden="true"
            style={{
              transform: `translate(${previewPosition.current.x}px, ${previewPosition.current.y}px)`,
            }}
          >
            <FileIcon
              path={dragPreview.entry.name}
              directory={dragPreview.entry.isDirectory}
            />
            <span className="filename">{dragPreview.entry.name}</span>
            {!dragPreview.valid && (
              <svg
                className="drag-invalid-icon"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="6" />
                <path d="m4 4 8 8" />
              </svg>
            )}
          </div>,
          window.document.body,
        )}
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
          props={{
            ...props,
            startDrag,
            menu: (entry, x, y) => setMenu({ entry, x, y }),
          }}
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
              top: Math.min(menu.y, window.innerHeight - 340),
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
