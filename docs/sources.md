# Sources catalog maintenance

The bundled catalog is `src/data/sources.json`. Keep IDs stable when updating links: favorites and hidden entries refer to IDs. Each item has one category and a short, original explanation of when to use it.

The catalog was checked on 2026-10-25. Public pages were requested and their titles and destinations inspected; sites rejecting automated access were cross-checked through their official indexed pages. Codewell was omitted because its domain no longer showed the expected learning service. Godly now redirects to Recent, so the catalog uses Recent directly.

Automated responses from CodePen, SVG Repo, Unsplash, Pexels, Pixabay, siteInspire and Land-book were restricted (401/403/429); official web results confirmed their purpose. Font Squirrel returned 202. These restrictions are not evidence that a site is unavailable in a user's browser.

No external requests run while browsing the catalog in mIDE. Photos, fonts and icon descriptions remind users to review asset-specific licenses; this is not a blanket license grant.

When maintaining the catalog, check redirects, the service's current purpose and paid features, not just HTTP status. Keep approximately 70–80 entries across the existing eight categories and retain documentation for every supported editor technology.

## Collection format

User collections use JSON version 1 with `customSources`, `favoriteIds` and `hiddenBuiltinIds`. Custom entries contain `id`, `title`, `url`, `description`, `category` and `tags`. Persisted and imported collections are limited to 1 MiB in UTF-8. Unknown preference IDs are retained so a catalog update or an older installation does not silently discard them. IDs of custom entries cannot collide with bundled IDs.

Merge retains local entries with matching IDs and unions preferences. Replace affects only the user collection. The bundled catalog is never replaced by an import.
