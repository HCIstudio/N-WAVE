import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for the canvas flow. They run against the backend-less
// demo build (VITE_DEMO_MODE), served by `vite preview`, so they need no
// MongoDB, Docker or Nextflow. Run with `pnpm test:e2e`.
const PORT = 4300;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    env: { VITE_DEMO_MODE: "true" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
