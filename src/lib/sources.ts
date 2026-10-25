import catalog from "../data/sources.json";

export const categories = [
  "Documentation",
  "Learning & Articles",
  "Tools",
  "Colors & Gradients",
  "Fonts",
  "Icons & Illustrations",
  "Photos",
  "Inspiration",
] as const;
export type SourceCategory = (typeof categories)[number];
export interface Source {
  id: string;
  title: string;
  url: string;
  description: string;
  category: SourceCategory;
  tags: string[];
}
export interface SourcesState {
  version: 1;
  customSources: Source[];
  favoriteIds: string[];
  hiddenBuiltinIds: string[];
}
export const builtinSources = catalog as Source[];
export const sourcesKey = "mide-sources";
export const emptySources = (): SourcesState => ({
  version: 1,
  customSources: [],
  favoriteIds: [],
  hiddenBuiltinIds: [],
});
export function validSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function validateSource(value: unknown): Source {
  if (!value || typeof value !== "object")
    throw new Error("Invalid source entry.");
  const item = value as Source;
  for (const field of ["id", "title", "url", "description"] as const)
    if (
      typeof item[field] !== "string" ||
      !item[field].trim() ||
      item[field].length > (field === "description" ? 1000 : 2048)
    )
      throw new Error(`Source ${field} is missing or too long.`);
  if (!validSourceUrl(item.url))
    throw new Error("Use an HTTP or HTTPS address without credentials.");
  if (!categories.includes(item.category))
    throw new Error("Choose a supported category.");
  if (
    !Array.isArray(item.tags) ||
    item.tags.length > 20 ||
    item.tags.some(
      (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 80,
    )
  )
    throw new Error("Use up to 20 tags of at most 80 characters.");
  return {
    id: item.id,
    title: item.title.trim(),
    url: item.url.trim(),
    description: item.description.trim(),
    category: item.category,
    tags: [...new Set(item.tags.map((tag) => tag.trim()))],
  };
}
export function parseSources(text: string): SourcesState {
  if (new TextEncoder().encode(text).length > 1048576)
    throw new Error("Sources file must be at most 1 MiB.");
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || !Array.isArray(data.customSources))
    throw new Error("Unsupported Sources file. Expected version 1.");
  const customSources: Source[] = data.customSources.map(validateSource);
  const ids = customSources.map((item) => item.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => builtinSources.some((item) => item.id === id))
  )
    throw new Error(
      "Source IDs must be unique and separate from built-in IDs.",
    );
  for (const key of ["favoriteIds", "hiddenBuiltinIds"])
    if (
      !Array.isArray(data[key]) ||
      data[key].some(
        (id: unknown) => typeof id !== "string" || id.length > 2048,
      )
    )
      throw new Error(`Invalid ${key}.`);
  return {
    version: 1,
    customSources,
    favoriteIds: [...new Set<string>(data.favoriteIds)],
    hiddenBuiltinIds: [...new Set<string>(data.hiddenBuiltinIds)],
  };
}
export function mergeSources(
  current: SourcesState,
  incoming: SourcesState,
): SourcesState {
  return {
    version: 1,
    customSources: [
      ...current.customSources,
      ...incoming.customSources.filter(
        (item) =>
          !current.customSources.some((existing) => existing.id === item.id),
      ),
    ],
    favoriteIds: [
      ...new Set([...current.favoriteIds, ...incoming.favoriteIds]),
    ],
    hiddenBuiltinIds: [
      ...new Set([...current.hiddenBuiltinIds, ...incoming.hiddenBuiltinIds]),
    ],
  };
}
export type SourceFilter =
  "All" | "Favorites" | "My sources" | "Hidden sources";
export function filterSources(
  state: SourcesState,
  filter: SourceFilter,
  category: string,
  query: string,
): Source[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return [...builtinSources, ...state.customSources].filter((item) => {
    const builtin = builtinSources.some((source) => source.id === item.id);
    const hidden = builtin && state.hiddenBuiltinIds.includes(item.id);
    if (filter === "Hidden sources" ? !hidden : hidden) return false;
    if (filter === "Favorites" && !state.favoriteIds.includes(item.id))
      return false;
    if (filter === "My sources" && builtin) return false;
    if (category !== "All categories" && category !== item.category)
      return false;
    const haystack =
      `${item.title} ${item.description} ${new URL(item.url).hostname} ${item.tags.join(" ")}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
export function saveSources(
  storage: Pick<Storage, "setItem">,
  state: SourcesState,
) {
  const text = JSON.stringify(state);
  parseSources(text);
  storage.setItem(sourcesKey, text);
}
