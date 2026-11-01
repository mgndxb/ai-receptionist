import { defineConfig } from "vitest/config";

// Evals talk to the real model, so they're kept out of `npm test` and run with `npm run eval`.
export default defineConfig({
  test: { include: ["evals/**/*.eval.ts"], testTimeout: 90_000, maxConcurrency: 4 },
});
