import { defineConfig } from "vitest/config";

// Long-running simulations, such as the check that no personality changes a bot's strength.
export default defineConfig({
  test: { include: ["test/**/*.slow.test.ts"] },
});
