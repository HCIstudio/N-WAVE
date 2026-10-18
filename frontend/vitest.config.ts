import { defineConfig } from "vitest/config";

// Vitest configuration for the frontend unit tests. jsdom gives us a browser-ish
// environment (localStorage, etc.) for the demo store tests; the pure-logic
// tests (import parser, script generator) don't need it but it's harmless.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      // Run with `pnpm test:coverage`; CI runs it and fails below these
      // thresholds. Raise the global floor as coverage grows, never lower it.
      provider: "v8",
      reporter: ["text", "text-summary"],
      thresholds: {
        lines: 74,
        // Script generation and the .nf importer turn a user's work into
        // Nextflow and back: keep them well tested.
        "src/generators/**": { lines: 80 },
        "src/workflows/importNextflowWorkflow.ts": { lines: 80 },
      },
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/*.d.ts",
        "src/test/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
    },
  },
});
