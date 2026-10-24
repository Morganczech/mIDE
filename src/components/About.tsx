import { useEffect, useRef } from "react";
import { version } from "../../src-tauri/tauri.conf.json";
import license from "../../LICENSE?raw";

export function About({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLHeadingElement>("h2")?.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="about-dialog"
      aria-labelledby="about-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="about-title" tabIndex={-1}>
        mIDE <span className="about-version">{version}</span>
      </h2>
      <p className="about-subtitle">minimal IDE</p>
      <p>
        A quiet desktop editor for learning programming by writing code
        manually. No AI, code suggestions, autocomplete or automatic closing of
        tags and brackets.
      </p>
      <dl className="about-details">
        <div>
          <dt>Author</dt>
          <dd>Morganczech</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>MIT · © 2026 Morganczech</dd>
        </div>
      </dl>
      <label className="about-repository" htmlFor="about-repository">
        Source code
      </label>
      <input
        id="about-repository"
        readOnly
        value="https://github.com/Morganczech/mIDE"
        onFocus={(event) => event.currentTarget.select()}
      />
      <p className="about-credits">
        Built with Tauri, Rust, React and CodeMirror. File icons from Devicon.
        Third-party components retain their respective licenses.
      </p>
      <details className="about-license">
        <summary>MIT license</summary>
        <pre>{license}</pre>
      </details>
      <div className="dialog-actions">
        <button onClick={close}>Close</button>
      </div>
    </dialog>
  );
}
