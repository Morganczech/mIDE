import { useEffect, useRef } from "react";

export const modifierKey = navigator.platform.includes("Mac") ? "Cmd" : "Ctrl";
export const focusShortcut = `${modifierKey} + Shift + Enter`;

const shortcuts = [
  ["Open Folder", `${modifierKey} + O`],
  ["Save", `${modifierKey} + S`],
  ["Find", `${modifierKey} + F`],
  ["Find in Project", `${modifierKey} + Alt + F`],
  ["Format Document", `${modifierKey} + Shift + F`],
  ["Toggle Terminal", `${modifierKey} + J`],
  ["Close Tab", `${modifierKey} + W`],
  ["Next Tab", `${modifierKey} + Tab`],
  ["Toggle Focus Mode", focusShortcut],
  ["Exit Focus Mode", "Esc"],
  ["Increase Editor Text", `${modifierKey} + + (or ${modifierKey} + =)`],
  ["Decrease Editor Text", `${modifierKey} + −`],
  ["Reset Editor Text", `${modifierKey} + 0`],
  ["Toggle Sources", `${modifierKey} + Alt + S`],
  ["Settings", `${modifierKey} + ,`],
  ["Keyboard Shortcuts", "F1"],
];

export function KeyboardShortcuts({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLHeadingElement>("h2")?.focus();
    dialog.scrollTop = 0;
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className="shortcuts-dialog"
      ref={ref}
      aria-labelledby="shortcuts-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="shortcuts-title" tabIndex={-1}>
        Keyboard Shortcuts
      </h2>
      <table aria-label="Keyboard shortcuts">
        <tbody>
          {shortcuts.map(([action, keys]) => (
            <tr key={action}>
              <th scope="row">{action}</th>
              <td>
                <kbd>{keys}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="dialog-actions">
        <button onClick={close}>Close</button>
      </div>
    </dialog>
  );
}
