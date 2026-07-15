import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  // Workspace package ships TS source, so it must be bundled rather than left external.
  noExternal: ["@buildora/shared"],
});
