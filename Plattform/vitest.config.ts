import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/worker/**/*.test.ts"],
    globalSetup: ["tests/worker/globalSetup.ts"],
    // Worker-Tests teilen sich eine lokale Testdatenbank → nacheinander ausführen
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
