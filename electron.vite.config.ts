import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    // Test switches are compiled in only for `--mode verification` builds.
    define: { __VERIFICATION_BUILD__: JSON.stringify(mode === "verification") },
    build: { rollupOptions: { input: resolve("src/main/index.ts") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve("src/preload/index.ts") } },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
}));
