import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.vitest.test.ts", "tests/**/*.test.ts", "test/**/*.test.ts"],
    hookTimeout: 30000,
    testTimeout: 60000,
  },
});
