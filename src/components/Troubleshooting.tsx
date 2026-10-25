import { useState } from "react";
import { backend, errorMessage } from "../lib/backend";
import { findTroubleshootingGuides } from "../lib/troubleshooting";
export function Troubleshooting({ query }: { query: string }) {
  const guides = findTroubleshootingGuides(query);
  const [error, setError] = useState("");
  return (
    <section
      className="troubleshooting"
      aria-labelledby="troubleshooting-heading"
    >
      <h2 id="troubleshooting-heading">Troubleshooting</h2>
      <p className="sources-intro">
        Work through these offline checks one at a time. Change one thing, save
        and test again. Documentation links open in your browser.
      </p>
      <p className="sources-count" role="status">
        {guides.length} {guides.length === 1 ? "guide" : "guides"}
      </p>
      {error && (
        <p className="sources-feedback" role="alert">
          {error} <button onClick={() => setError("")}>Dismiss</button>
        </p>
      )}
      {guides.length === 0 && (
        <p>
          No matching guides. Try a symptom such as “image”, “button” or “CSS”.
        </p>
      )}
      {guides.map((guide) => (
        <details className="troubleshooting-guide" key={guide.id}>
          <summary>{guide.title}</summary>
          <p>{guide.summary}</p>
          <ol>
            {guide.steps.map((step, index) => (
              <li key={index}>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
                {step.example && (
                  <pre>
                    <code>{step.example}</code>
                  </pre>
                )}
              </li>
            ))}
          </ol>
          <a
            href={guide.url}
            onClick={(event) => {
              event.preventDefault();
              setError("");
              void backend
                .openSourceUrl(guide.url)
                .catch((error) => setError(errorMessage(error)));
            }}
          >
            Read more on MDN
          </a>
        </details>
      ))}
    </section>
  );
}
