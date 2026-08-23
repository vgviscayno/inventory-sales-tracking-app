import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs functions in a stripped-down runtime, not Node's. The
    // tests under src/ are plain units, and they run there too.
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "src/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
