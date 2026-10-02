import { configDefaults, defineConfig } from "vitest/config";

// The everyday suite skips the slow simulations. Run those with `npm run test:slow`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/*.slow.test.ts"],
    // Coverage instrumentation slows the bot-strength simulations past the 5 second default.
    testTimeout: 30_000,
    // `npm run test:coverage`. Measures the engine itself, not the tests or the simulation tooling.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary"],
      // A floor, a little under today's numbers, so coverage cannot quietly slide.
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
});
