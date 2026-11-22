import { resolve } from "node:path";
import { defineConfig } from "vite";

// Three pages: the app, the privacy policy and the disclaimer.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        privacy: resolve(import.meta.dirname, "privacy.html"),
        disclaimer: resolve(import.meta.dirname, "disclaimer.html"),
      },
    },
  },
});
