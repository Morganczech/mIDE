import { useEffect, useRef, useState } from "react";
export interface DialogRequest {
  title: string;
  message?: string;
  input?: string;
  buttons: string[];
  resolve: (answer: string | null) => void;
}
export function Dialog({ request }: { request: DialogRequest }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(request.input ?? "");
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        request.resolve(null);
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          request.resolve(
            request.input === undefined ? request.buttons[0] : value,
          );
        }}
      >
        <h2>{request.title}</h2>
        {request.message && <p>{request.message}</p>}
        {request.input !== undefined && (
          <input
            autoFocus
            aria-label={request.title}
            value={value}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <div className="dialog-actions">
          {request.buttons.map((button, index) => (
            <button
              key={button}
              className={index === 0 ? "primary" : ""}
              type={index === 0 ? "submit" : "button"}
              onClick={
                index === 0
                  ? undefined
                  : () => request.resolve(button === "Cancel" ? null : button)
              }
            >
              {button}
            </button>
          ))}
        </div>
      </form>
    </dialog>
  );
}
