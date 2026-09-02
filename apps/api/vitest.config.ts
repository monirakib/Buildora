import { defineConfig } from "vitest/config";

/**
 * Unit tests only — no database, no network, no server.
 *
 * Everything under src/services that this suite covers is pure: given the same
 * inputs it returns the same output. That is deliberate, and it is what makes
 * the tests worth having, because the logic they cover (a repricing sanity
 * band, a unit alias table, a similarity threshold, a coordinate order) is
 * exactly the kind that fails silently and correctly-looking.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /* Each file gets a clean module registry, so a service that memoises
       something at module scope can't leak it into the next file. */
    isolate: true,
  },
});
