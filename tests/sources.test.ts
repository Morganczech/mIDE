import { describe, expect, it } from "vitest";
import {
  builtinSources,
  categories,
  emptySources,
  filterSources,
  mergeSources,
  parseSources,
  saveSources,
  sourcesKey,
  validateSource,
  validSourceUrl,
  type Source,
} from "../src/lib/sources";
const custom: Source = {
  id: "custom-test",
  title: "My CSS guide",
  url: "https://example.com/css",
  description: "Practice responsive layouts.",
  category: "Learning & Articles",
  tags: ["CSS", "Layout"],
};
describe("Sources collection", () => {
  it("ships a valid catalog with unique IDs, categories and required technologies", () => {
    expect(builtinSources.length).toBeGreaterThanOrEqual(70);
    expect(builtinSources.length).toBeLessThanOrEqual(80);
    expect(new Set(builtinSources.map((item) => item.id)).size).toBe(
      builtinSources.length,
    );
    builtinSources.forEach((source) =>
      expect(validateSource(source)).toEqual(source),
    );
    categories.forEach((category) =>
      expect(builtinSources.some((item) => item.category === category)).toBe(
        true,
      ),
    );
    for (const tag of [
      "HTML",
      "CSS",
      "JavaScript",
      "TypeScript",
      "JSX",
      "TSX",
      "Astro",
      "JSON",
      "Markdown",
      "MDX",
    ])
      expect(builtinSources.some((item) => item.tags.includes(tag))).toBe(true);
  });
  it("combines search terms, categories and personal collection filters", () => {
    const state = {
      ...emptySources(),
      customSources: [custom],
      favoriteIds: [custom.id, "mdn-css"],
      hiddenBuiltinIds: ["mdn-css"],
    };
    expect(
      filterSources(state, "Favorites", "All categories", "").map(
        (item) => item.id,
      ),
    ).toEqual([custom.id]);
    expect(
      filterSources(
        state,
        "My sources",
        "Learning & Articles",
        "EXAMPLE.com layout",
      ),
    ).toEqual([custom]);
    expect(filterSources(state, "My sources", "Tools", "")).toEqual([]);
    expect(
      filterSources(state, "Hidden sources", "Documentation", "CSS").map(
        (item) => item.id,
      ),
    ).toEqual(["mdn-css"]);
    expect(
      filterSources(state, "All", "All categories", "no-such-source"),
    ).toEqual([]);
  });
  it("roundtrips a collection including hidden IDs unknown to this catalog", () => {
    const state = {
      ...emptySources(),
      customSources: [custom],
      favoriteIds: [custom.id],
      hiddenBuiltinIds: ["future-id"],
    };
    let text = "";
    saveSources(
      {
        setItem(key, value) {
          expect(key).toBe(sourcesKey);
          text = value;
        },
      },
      state,
    );
    expect(parseSources(text)).toEqual(state);
  });
  it("merges with current entries winning and unions preferences", () => {
    const current = {
      ...emptySources(),
      customSources: [custom],
      favoriteIds: [custom.id],
    };
    const incoming = {
      ...emptySources(),
      customSources: [
        { ...custom, title: "Changed" },
        { ...custom, id: "custom-second" },
      ],
      favoriteIds: [custom.id, "mdn-css"],
      hiddenBuiltinIds: ["mdn-html"],
    };
    const merged = mergeSources(current, incoming);
    expect(merged.customSources.map((item) => item.title)).toEqual([
      custom.title,
      custom.title,
    ]);
    expect(merged.favoriteIds).toEqual([custom.id, "mdn-css"]);
    expect(merged.hiddenBuiltinIds).toEqual(["mdn-html"]);
  });
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,hi",
    "https://user:pass@example.com",
    "not a URL",
  ])("rejects unsafe address %s", (url) => {
    expect(validSourceUrl(url)).toBe(false);
    expect(() => validateSource({ ...custom, url })).toThrow();
  });
  it.each([
    "not JSON",
    JSON.stringify({ ...emptySources(), version: 2 }),
    JSON.stringify({ ...emptySources(), customSources: [custom, custom] }),
    JSON.stringify({
      ...emptySources(),
      customSources: [{ ...custom, id: builtinSources[0].id }],
    }),
    JSON.stringify({
      ...emptySources(),
      customSources: [{ ...custom, category: "Unknown" }],
    }),
    JSON.stringify({ ...emptySources(), favoriteIds: [12] }),
    JSON.stringify({
      ...emptySources(),
      customSources: [{ ...custom, tags: [null] }],
    }),
    '"' + "é".repeat(524288) + '"',
  ])("rejects invalid imports without mutating current data", (text) => {
    const current = emptySources();
    expect(() => parseSources(text)).toThrow();
    expect(current).toEqual(emptySources());
  });
  it("propagates persistence errors", () => {
    expect(() =>
      saveSources(
        {
          setItem() {
            throw new Error("Disk full");
          },
        },
        emptySources(),
      ),
    ).toThrow("Disk full");
  });
});
