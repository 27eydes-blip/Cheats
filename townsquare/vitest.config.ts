import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/visual/**", "node_modules/**"],
    env: { DATABASE_PATH: ":memory:" },
  },
});
