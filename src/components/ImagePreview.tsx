import { useEffect, useState } from "react";
import { loadImage, imageDetails, type LoadedImage } from "../lib/images";
import { errorMessage } from "../lib/backend";
export function ImagePreview({
  path,
  version,
  source,
}: {
  path: string;
  version: number;
  source: () => void;
}) {
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setImage(null);
    setError("");
    loadImage(path)
      .then((value) => {
        if (alive) setImage(value);
      })
      .catch((error) => {
        if (alive) setError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return (
    <section
      id="image-host"
      className="image-preview"
      aria-label={`Image preview: ${path}`}
    >
      <header>
        <span>{path}</span>
        {/\.svg$/i.test(path) && <button onClick={source}>Open Source</button>}
      </header>
      {error ? (
        <p role="alert">Cannot preview this image: {error}</p>
      ) : image ? (
        <>
          <div className="image-canvas">
            <img
              src={image.url}
              alt={path}
              style={{ maxWidth: image.width, maxHeight: image.height }}
            />
          </div>
          <p>{imageDetails(image)}</p>
        </>
      ) : (
        <p role="status">Loading image…</p>
      )}
    </section>
  );
}
