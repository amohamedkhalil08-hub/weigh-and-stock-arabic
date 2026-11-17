import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: projectRoot,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: {
    "@": path.resolve(projectRoot, "src"),
    "virtual:pwa-register": path.resolve(projectRoot, "src/lib/pwa-register-stub.ts"),
    [path.resolve(projectRoot, "src/assets/hail-samar-brand.jpg.asset.json")]: path.resolve(projectRoot, "src/assets/hail-samar-brand.offline.json"),
  } },
  build: {
    outDir: path.resolve(projectRoot, "android-web"),
    emptyOutDir: true,
    rollupOptions: { input: { index: path.resolve(projectRoot, "android-shell/index.html") } },
  },
});
