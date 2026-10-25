import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves project sites under `/<repo>/`; the workflow exports
// GITHUB_REPOSITORY, so the base follows the repository name automatically.
// Locally (and for `vite preview`) the app stays at the site root.
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: repositoryName ? `/${repositoryName}/` : "/",
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
