import { useEffect, useRef, useState } from "react";
import {
  backend,
  errorMessage,
  isWithin,
  parentPath,
  type Entry,
} from "../lib/backend";
export function MoveDialog({
  entry,
  close,
  move,
}: {
  entry: Entry;
  close: () => void;
  move: (directory: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [path, setPath] = useState("");
  const [folders, setFolders] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    let alive = true;
    setFolders([]);
    setError("");
    backend
      .list(path)
      .then((entries) => {
        if (alive)
          setFolders(
            entries.filter(
              (item) =>
                item.isDirectory &&
                !item.isSymlink &&
                !(entry.isDirectory && isWithin(item.path, entry.path)),
            ),
          );
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [path, entry.path]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="move-heading"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="move-heading">Move {entry.name}</h2>
      <p>Destination: {path || "Project root"}</p>
      <div className="move-folders">
        {path && (
          <button onClick={() => setPath(parentPath(path))}>
            Parent folder
          </button>
        )}
        {folders.map((folder) => (
          <button key={folder.path} onClick={() => setPath(folder.path)}>
            {folder.name}/
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button
          disabled={!!error || path === parentPath(entry.path)}
          onClick={() => move(path)}
        >
          Move here
        </button>
        <button onClick={close}>Cancel</button>
      </div>
    </dialog>
  );
}
