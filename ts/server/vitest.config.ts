import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // `main.ts` only joins the other pieces and runs in a child process, so the real-server test covers it, not this.
      exclude: ["src/main.ts"],
      reporter: ["text", "json-summary"],
      // A floor a little under today's numbers, so coverage cannot quietly slide.
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
