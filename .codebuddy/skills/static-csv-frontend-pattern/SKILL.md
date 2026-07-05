---
name: static-csv-frontend-pattern
description: This skill should be used when building a frontend dashboard or playback app that needs to load, query, and visualize large static CSV datasets (100k+ rows) without relying on backend APIs or exceeding serverless bundle limits.
---

# Static CSV Frontend Pattern

## When to use this skill

Use this skill when all of the following are true:

- The dataset is static or rarely updated (e.g., historical AIS tracks, survey data, census data).
- The dataset is too large to comfortably bundle into a serverless function (typically > 5 MB raw JSON or > 50k rows).
- The primary workload is frontend filtering, playback, or visualization by time/ID.
- The target platform is Vercel, Netlify, GitHub Pages, or any static CDN host.

Do not use this skill when:

- Data is updated frequently or needs real-time ingestion.
- Users require complex SQL aggregation across the entire dataset.
- The dataset exceeds IndexedDB storage quotas on target devices (usually > 50–100 MB decompressed).

## Core workflow

1. **Build phase**: compress the raw CSV with gzip and place it in `public/data/` so the CDN serves it as a static asset.
2. **First visit**: fetch the gzip file, inflate it in the browser, stream-parse the CSV, and write records into IndexedDB with a time-based index.
3. **Subsequent visits**: skip the network fetch and read directly from IndexedDB.
4. **Runtime queries**: use the IndexedDB index to retrieve records by time range, MMSI, or other indexed fields.
5. **Render**: feed the filtered records to Maplibre, Deck.gl, Chart.js, or any renderer.

## Backend rules

- **Keep backend stateless and small.** If a backend API is kept for compatibility, it should not load the full dataset into memory at startup.
- **Generate backend data at build time.** If the API must serve subsets, pre-compute shards or limit the data to a small fallback sample.
- **Never block frontend boot on backend queries.** The frontend should be able to render the map and UI before data is ready.
- **Prefer static assets over API responses.** CDN delivery of a gzip file is cheaper, faster, and cache-friendly compared to serverless invocation.

## Frontend rules

- **Always compress the CSV.** A 20 MB CSV typically compresses to 2–4 MB with gzip, cutting first-load time by 80%+.
- **Always use a streaming CSV parser.** PapaParse with `step` keeps the UI responsive during the 100k+ row parse.
- **Always cache parsed data in IndexedDB.** This makes repeat visits and tab refreshes instant.
- **Index by the query dimension.** If the UI queries by time, create an IndexedDB index on `timestamp`.
- **Show real progress.** Parse and write batches incrementally and expose a progress callback to the component.
- **Avoid loading the entire CSV into component state.** Query IndexedDB for the visible window and paginate if necessary.

## Common errors and fixes

See `references/practices.md` for a detailed decision tree, exact code patterns, and platform-specific caveats (Vercel, Windows, pako v3, Maplibre @2x basemaps).
