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
  },
});
