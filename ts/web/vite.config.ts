import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // RULES.md sits at the repository root, two levels up, and a test imports it, so vite may read from there.
  server: { fs: { allow: ["../.."] } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // Without this Vitest stubs every .css import to an empty string, which would blind the theme tests.
    css: true,
    // `npm run test:coverage`. Measures the app's own code, not its tests, the entry point or throwaway previews.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-setup.ts", "src/main.tsx", "src/vite-env.d.ts", "src/_preview*"],
      reporter: ["text", "json-summary"],
      // A floor, a little under today's numbers, so coverage cannot quietly slide.
      thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 },
    },
  },
});
