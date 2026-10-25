import { backend } from "./backend";
export const isImage = (path: string) =>
  /\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(path);
export interface LoadedImage {
  url: string;
  path: string;
  size: number;
  width: number;
  height: number;
}
const cache = new Map<string, Promise<LoadedImage>>();
let generation = 0;
let cachedBytes = 0;
const sizes = new Map<string, number>();
let running = 0;
const waiting: (() => void)[] = [];
async function readImage(path: string) {
  await new Promise<void>((resolve) => {
    if (running < 4) {
      running++;
      resolve();
    } else waiting.push(resolve);
  });
  try {
    return await backend.image(path);
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}
export function clearImages() {
  generation++;
  cache.clear();
  sizes.clear();
  cachedBytes = 0;
}
export function loadImage(path: string): Promise<LoadedImage> {
  const cached = cache.get(path);
  if (cached) return cached;
  const epoch = generation;
  const promise = readImage(path).then(async ({ bytes, mime, size }) => {
    // Data URLs remain usable by mounted previews after the bounded cache evicts them.
    const blob = new Blob([new Uint8Array(bytes)], { type: mime });
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(blob);
    });
    const image = new Image();
    image.src = url;
    await image.decode();
    if (epoch !== generation) throw new Error("Image changed. Try again.");
    if (cache.get(path) === promise) {
      sizes.set(path, size);
      cachedBytes += size;
      while (cachedBytes > 32 * 1024 * 1024 && sizes.size > 1) {
        const oldest = sizes.keys().next().value!;
        cachedBytes -= sizes.get(oldest)!;
        sizes.delete(oldest);
        cache.delete(oldest);
      }
    }
    return {
      url,
      path,
      size,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  });
  cache.set(path, promise);
  if (cache.size > 24) {
    const oldest = cache.keys().next().value!;
    cachedBytes -= sizes.get(oldest) ?? 0;
    sizes.delete(oldest);
    cache.delete(oldest);
  }
  promise.catch(() => {
    if (cache.get(path) === promise) cache.delete(path);
  });
  return promise;
}
export function resolveImagePath(
  document: string,
  source: string,
): string | null {
  if (!source || /^(?:[a-z][\w+.-]*:|\/\/|#|@|~)/i.test(source)) return null;
  let clean: string;
  try {
    clean = decodeURIComponent(source.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  if (/[\\\x00-\x1f]/.test(clean)) return null;
  const parts = clean.startsWith("/") ? [] : document.split("/").slice(0, -1);
  for (const part of clean.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  const path = parts.join("/");
  return isImage(path) ? path : null;
}
export interface ImagePreferences {
  thumbnails: boolean;
  imageHover: boolean;
  htmlHover: boolean;
  cssHover: boolean;
}
export const preferenceLabels: Record<keyof ImagePreferences, string> = {
  thumbnails: "Image thumbnails in gutter",
  imageHover: "Image previews on hover",
  htmlHover: "HTML documentation on hover",
  cssHover: "CSS documentation on hover",
};
export function loadImagePreferences(): ImagePreferences {
  return Object.fromEntries(
    Object.keys(preferenceLabels).map((key) => [
      key,
      localStorage.getItem(`mide-${key}`) !== "0",
    ]),
  ) as unknown as ImagePreferences;
}
export function imageDetails(image: LoadedImage) {
  return `${image.width} × ${image.height} · ${(image.size / 1024).toLocaleString("en", { maximumFractionDigits: 1 })} KiB`;
}
export function imageCard(image: LoadedImage) {
  const card = document.createElement("div");
  card.className = "image-hover-card";
  const img = document.createElement("img");
  img.src = image.url;
  img.alt = image.path;
  const details = document.createElement("div");
  details.textContent = imageDetails(image);
  const path = document.createElement("div");
  path.textContent = image.path;
  card.append(img, details, path);
  return card;
}
