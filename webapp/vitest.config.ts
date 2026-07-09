import { defineConfig } from "vitest/config"
import tsconfigPaths from "vite-tsconfig-paths"

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Dummy connection strings so importing service modules (which pull in lib/db → lib/env, where
    // DATABASE_URL is validated at import) doesn't throw. The pure-logic tests never open a real
    // connection; tests that exercise the DB mock `@/lib/db` directly.
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
      DIRECT_URL: "postgresql://user:pass@localhost:5432/test",
    },
  },
})
