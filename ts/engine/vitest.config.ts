import { configDefaults, defineConfig } from "vitest/config";

// The everyday suite skips the slow simulations. Run those with `npm run test:slow`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.slow.test.ts"] },
});
