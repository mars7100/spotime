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
      // The vanilla client, until ticket 14 retires it.
      "/legacy": "http://localhost:8080",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
  build: {
    // Content-hashed filenames are what let the server pin assets forever; the
    // entry HTML that names them stays revalidating. See backend/main.py.
    outDir: "dist",
    emptyOutDir: true,
  },
});
