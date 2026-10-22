import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import process from "node:process";
import { fileURLToPath } from "node:url";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  resolve: {
    // These packages' browser builds use `document` or `DOMParser`, which the render worker doesn't have;
    // their plain builds work everywhere.
    alias: {
      "decode-named-character-reference": fileURLToPath(
        new URL("node_modules/decode-named-character-reference/index.js", import.meta.url),
      ),
      "hast-util-from-html-isomorphic": fileURLToPath(
        new URL("node_modules/hast-util-from-html-isomorphic/index.js", import.meta.url),
      ),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // The render worker loads KaTeX and highlighting on demand, which needs an ES module worker.
  worker: { format: "es" as const },

  test: {
    // The first test run after an install loads KaTeX and highlight.js cold and can pass 5 s.
    testTimeout: 20_000,
  },
}));
