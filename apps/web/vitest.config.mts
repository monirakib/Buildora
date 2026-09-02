import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Pure-logic tests for the web app. No DOM and no component rendering — the
 * things worth testing here are the helpers that quietly rewrite URLs and
 * strings on every render, where a wrong result looks like a working page.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
