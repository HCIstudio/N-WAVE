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
      // Run with `pnpm test:coverage`. CI reports the summary in its logs; no
      // threshold gate for now (coverage is still low — tightening it is
      // tracked separately). Enable thresholds here when ready to enforce.
      provider: "v8",
      reporter: ["text", "text-summary"],
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
