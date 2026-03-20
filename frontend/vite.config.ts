import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8")
) as { version?: string };

const resolveGitSha = () => {
  if (process.env.GIT_SHA) {
    return process.env.GIT_SHA;
  }

  try {
    return execSync("git -C .. rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
};

const resolveCommitDate = () => {
  if (process.env.BUILD_DATE?.trim()) {
    return process.env.BUILD_DATE.trim();
  }

  try {
    return execSync("git -C .. log -1 --format=%cI", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return new Date().toISOString();
  }
};

const appVersion =
  process.env.APP_VERSION?.trim() || packageJson.version || "0.0.0";
const buildDate = resolveCommitDate();
const gitSha = resolveGitSha();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
