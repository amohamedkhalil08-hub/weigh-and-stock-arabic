# Plan: Make Hail Samar Stock installable and offline-ready

## What is already in place
- The app already uses `vite-plugin-pwa` to generate a service worker and cache app assets and visited pages.
- Registration is disabled in development and Lovable previews; production publishes register it.
- Stock records are kept on-device in IndexedDB, with no online stock service.

## Work
1. Add the requested `public/manifest.json` with the app name, Arabic short name, standalone display, theme colors, and local app icons based on the official brand image.
2. Add the manifest, theme-color, and Apple touch-icon links in the shared app head so installation works across supported browsers.
3. Refine the existing generated service-worker setup to cache the app shell, built JavaScript/CSS, icons, and the brand image; keep navigation caching suitable for offline reopen after the first online visit.
4. Preserve preview protections so the worker only runs on the published app, and leave all stock storage local and backend-free.
5. Verify the manifest and worker output, app startup and navigation with the network disabled after an initial load, and existing stock-flow tests where the preview permits.

## Storage note
The request mentions `localStorage`, but this app's stock records currently use IndexedDB, and the project requires a single IndexedDB transaction for an item plus its opening stock movement. Keep IndexedDB to preserve existing records and that atomic save behavior; no records will be sent online.

## Limitation
Published-domain airplane-mode behavior cannot be confirmed inside the Lovable preview because worker registration is intentionally blocked there; it must be checked on the published app.
