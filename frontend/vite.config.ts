/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API is proxied through the dev server so the browser sees a single origin,
// exactly as it does in production. Nothing in the app knows an API base URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    // Node 25+ ships its own `localStorage` global (undefined without a
    // backing file), and it shadows jsdom's. Turn Node's off in the workers.
    poolOptions: { forks: { execArgv: ["--no-experimental-webstorage"] } },
  },
  build: {
    // Content-hashed filenames are what let the server pin assets forever; the
    // entry HTML that names them stays revalidating. See backend/main.py.
    outDir: "dist",
    emptyOutDir: true,
  },
});
