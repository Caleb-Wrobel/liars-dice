import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
      // A floor a little under today's numbers, so coverage cannot quietly slide.
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
