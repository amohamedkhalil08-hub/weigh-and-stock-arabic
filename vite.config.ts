// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      strategies: "generateSW",
      injectRegister: null,
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      filename: "sw.js",
      workbox: {
        navigateFallback: null,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              url.origin === self.location.origin &&
              request.destination === "image" &&
              /^\/__l5e\/assets-v1\/[a-f0-9-]{36}\/hail-samar-brand\.jpg$/i.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "hail-samar-brand" },
          },
          {
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" &&
              url.origin === self.location.origin &&
              !url.pathname.startsWith("/~oauth"),
            handler: "NetworkFirst",
            options: {
              cacheName: "hail-samar-pages",
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request, url }) =>
              url.origin === self.location.origin &&
              url.pathname.startsWith("/assets/") &&
              /(^|\/)[^/]+-[a-zA-Z0-9_-]{8,}\.(?:js|css|png|jpe?g|svg|webp|woff2?)$/i.test(url.pathname) &&
              ["script", "style", "image", "font"].includes(request.destination),
            handler: "CacheFirst",
            options: { cacheName: "hail-samar-assets" },
          },
        ],
      },
    }),
  ],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
