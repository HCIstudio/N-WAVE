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

// When deploying to a sub-path (e.g. GitHub Pages at /N-WAVE/) set
// VITE_BASE_PATH so asset URLs and the router basename are prefixed correctly.
// Defaults to "/" for local dev and the Docker/nginx deployment.
const basePath = process.env.VITE_BASE_PATH?.trim() || "/";

// Long-lived vendor chunks, split from app code so they stay cached across
// releases. Everything else is chunked by Rollup along the lazy route imports
// in src/main.tsx.
const vendorChunks: Record<string, RegExp> = {
  "vendor-react":
    /[\\/]node_modules[\\/](\.pnpm[\\/])?(react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/+]router)[@\\/]/,
  "vendor-reactflow":
    /[\\/]node_modules[\\/](\.pnpm[\\/])?(reactflow|@reactflow[\\/+][^\\/]+|d3-[^\\/@]+|zustand|classcat)[@\\/]/,
};

// https://vite.dev/config/
export default defineConfig({
  base: basePath,
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [chunk, pattern] of Object.entries(vendorChunks)) {
            if (pattern.test(id)) return chunk;
          }
          return undefined;
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Dev proxy so the frontend's "/api" calls reach the local backend
      // (backend defaults to port 5001 — see backend/.env / docker-compose).
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
});
