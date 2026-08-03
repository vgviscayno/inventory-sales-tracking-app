import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs functions in a stripped-down runtime, not Node's.
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
