import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { resetPipelineCatalog } from "../pipelines/catalog";

// The shape of nf-co.re/pipelines.json, cut down.
const PIPELINES_JSON = {
  remote_workflows: [
    {
      name: "rnaseq",
      description: "RNA sequencing analysis pipeline",
      archived: false,
      releases: [
        { tag_name: "dev", published_at: null },
        { tag_name: "3.26.0", published_at: "2025-08-01T00:00:00Z" },
        { tag_name: "3.27.0", published_at: "2025-10-01T00:00:00Z" },
      ],
    },
    {
      name: "atacseq",
      description: "ATAC-seq peak-calling and QC analysis pipeline",
      archived: false,
      releases: [{ tag_name: "2.1.2", published_at: "2023-01-01T00:00:00Z" }],
    },
    { name: "Not A Name!", releases: [] },
    { name: "old", description: "Gone", archived: true, releases: [] },
  ],
};
let catalogDown = false;

// Pipeline schemas come from raw.githubusercontent.com; serve a stand-in for
// rnaseq and a 404 for everything else.
const githubRequests: string[] = [];
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  const get = vi.fn(async (url: string) => {
    githubRequests.push(url);
    if (url === "https://nf-co.re/pipelines.json") {
      if (catalogDown) throw new actual.AxiosError("getaddrinfo ENOTFOUND");
      return { data: PIPELINES_JSON };
    }
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
  catalogDown = false;
  resetPipelineCatalog();
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

describe("GET /api/pipelines", () => {
  it("lists the pipelines with their releases, newest first", async () => {
    const response = await request(app).get("/api/pipelines").expect(200);
    expect(response.body.pipelines).toEqual([
      {
        name: "atacseq",
        description: "ATAC-seq peak-calling and QC analysis pipeline",
        versions: ["2.1.2"],
        archived: false,
      },
      { name: "old", description: "Gone", versions: [], archived: true },
      {
        name: "rnaseq",
        description: "RNA sequencing analysis pipeline",
        versions: ["3.27.0", "3.26.0"],
        archived: false,
      },
    ]);
    expect(response.body.stale).toBeUndefined();
    // Fetched once for a while.
    await request(app).get("/api/pipelines").expect(200);
    expect(githubRequests).toHaveLength(1);
  });

  it("falls back to the last list on disk when nf-co.re is down", async () => {
    catalogDown = true;
    const down = await request(app).get("/api/pipelines").expect(502);
    expect(down.body.message).toContain("nf-co.re");

    catalogDown = false;
    await request(app).get("/api/pipelines").expect(200);
    resetPipelineCatalog();
    catalogDown = true;
    const stale = await request(app).get("/api/pipelines").expect(200);
    expect(stale.body.stale).toBe(true);
    expect(stale.body.pipelines).toHaveLength(3);
  });
});
