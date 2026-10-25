import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves a project site under `/<repo>/` — but when the Pages
// site has a custom domain (here: guitar.lerte.com), it is served at the
// domain root instead. The deploy workflow passes the base path reported by
// actions/configure-pages, which accounts for both cases; empty means root.
// Local dev, `vite preview` and plain `npm run build` stay at the root.
const pagesBasePath = process.env.PAGES_BASE_PATH?.trim() ?? "";
const base = pagesBasePath ? `${pagesBasePath.replace(/\/+$/, "")}/` : "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    strictPort: false,
    watch: {
      // Tool scratch dirs must not trigger a full page reload mid-performance.
      ignored: ["**/.tmp/**", "**/.chrome-profile/**", "**/.npm-cache/**", "**/dist/**"],
    },
  },
  build: {
    target: "es2022",
  },
});
