import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";

// Pipeline schemas come from raw.githubusercontent.com; serve a stand-in for
// rnaseq and a 404 for everything else.
const githubRequests: string[] = [];
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  const get = vi.fn(async (url: string) => {
    githubRequests.push(url);
    if (!url.includes("/nf-core/rnaseq/")) {
      throw Object.assign(new actual.AxiosError("Not Found"), {
        response: { status: 404 },
      });
    }
    return { data: JSON.stringify({ title: "nf-core/rnaseq", $defs: {} }) };
  });
  return {
    ...actual,
    default: { ...actual.default, get, isAxiosError: actual.isAxiosError },
  };
});

const app = createApp();
let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-pipelines-"));
  vi.stubEnv("NWAVE_DATA_DIR", dataDir);
  githubRequests.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/pipelines/schema", () => {
  it("fetches a release's schema once and caches it", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request(app)
        .get("/api/pipelines/schema")
        .query({ name: "rnaseq", version: "3.27.0" })
        .expect(200);
      expect(response.body.schema.title).toBe("nf-core/rnaseq");
    }
    expect(githubRequests).toEqual([
      "https://raw.githubusercontent.com/nf-core/rnaseq/3.27.0/nextflow_schema.json",
    ]);
  });

  it("doesn't cache branches", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .get("/api/pipelines/schema")
        .query({ name: "rnaseq", version: "dev" })
        .expect(200);
    }
    expect(githubRequests).toHaveLength(2);
  });

  it("reports unknown pipelines and rejects bad names", async () => {
    const missing = await request(app)
      .get("/api/pipelines/schema")
      .query({ name: "nope", version: "1.0.0" })
      .expect(404);
    expect(missing.body.message).toContain("nf-core/nope 1.0.0");
    for (const query of [
      { name: "../x", version: "1.0" },
      { name: "rnaseq", version: "1.0/../../x" },
      { name: "rnaseq" },
    ]) {
      await request(app).get("/api/pipelines/schema").query(query).expect(400);
    }
    expect(githubRequests).toHaveLength(1);
  });
});
