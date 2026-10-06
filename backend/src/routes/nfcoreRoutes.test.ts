import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";

const app = createApp();

describe("GET /api/nfcore/modules/source", () => {
  it("returns the main.nf of a bundled module", async () => {
    const response = await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/fastqc" })
      .expect(200);
    expect(response.body.id).toBe("nf-core/fastqc");
    expect(response.body.source).toMatch(/process FASTQC \{/);
  });

  it("reports modules that are not installed", async () => {
    await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/samtools/sort" })
      .expect(404);
  });

  it.each(["fastqc", "nf-core/../../etc", "nf-core/fastqc/../x", ""])(
    "rejects invalid id %j",
    async (id) => {
      await request(app)
        .get("/api/nfcore/modules/source")
        .query({ id })
        .expect(400);
    }
  );
});

describe("GET /api/nfcore/modules/files", () => {
  it("returns the files a bundled module needs to run", async () => {
    const response = await request(app)
      .get("/api/nfcore/modules/files")
      .query({ id: "nf-core/fastqc" })
      .expect(200);
    expect(Object.keys(response.body.files).sort()).toEqual([
      "environment.yml",
      "main.nf",
      "meta.yml",
    ]);
    expect(response.body.files["main.nf"]).toMatch(/process FASTQC \{/);
  });

  it("reports modules that are not installed and rejects bad ids", async () => {
    await request(app)
      .get("/api/nfcore/modules/files")
      .query({ id: "nf-core/samtools/sort" })
      .expect(404);
    await request(app)
      .get("/api/nfcore/modules/files")
      .query({ id: "nf-core/../x" })
      .expect(400);
  });
});

describe("installed nf-core modules", () => {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../workflows/library/assets/nf-core/catalog.json"),
      "utf8"
    )
  ) as { source: { commit: string } };
  let dataDir: string;

  const install = (sourceCommit: string) => {
    const moduleDir = path.join(dataDir, "nf-core/modules/nf-core/star/align");
    fs.mkdirSync(moduleDir, { recursive: true });
    const manifestPath = path.join(moduleDir, "nwave.adapter.json");
    // A manifest written by an older N-WAVE: ports from meta.yml, no values.
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        id: "nf-core/star/align",
        inputs: [{ handle: "meta", nfcoreName: "meta", adapter: "path" }],
        defaults: {},
      })
    );
    fs.writeFileSync(
      path.join(dataDir, "nf-core/installed.json"),
      JSON.stringify({
        "nf-core/star/align": {
          id: "nf-core/star/align",
          installedAt: "2026-01-01T00:00:00.000Z",
          moduleDir,
          manifestPath,
          sourceCommit,
          support: "candidate",
        },
      })
    );
  };

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-nfcore-"));
    vi.stubEnv("NWAVE_DATA_DIR", dataDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("refreshes the input layout of modules installed from the catalog commit", async () => {
    install(catalog.source.commit);
    const response = await request(app).get("/api/nfcore/installed").expect(200);
    const manifest = response.body.installed[0].manifest;

    expect(manifest.inputs.map((input: { handle: string }) => input.handle)).toEqual([
      "reads",
      "index",
      "gtf",
    ]);
    expect(manifest.valueInputs).toEqual([
      expect.objectContaining({
        name: "star_ignore_sjdbgtf",
        type: "boolean",
        defaultValue: false,
      }),
    ]);
    expect(manifest.outdated).toBeUndefined();
  });

  it("uninstalls a module", async () => {
    install(catalog.source.commit);
    const moduleDir = path.join(dataDir, "nf-core/modules/nf-core/star/align");

    await request(app)
      .post("/api/nfcore/uninstall")
      .send({ id: "nf-core/star/align" })
      .expect(200, { id: "nf-core/star/align" });

    expect(fs.existsSync(moduleDir)).toBe(false);
    const response = await request(app).get("/api/nfcore/installed").expect(200);
    expect(response.body.installed).toEqual([]);
  });

  it("refuses to uninstall bundled or unknown modules", async () => {
    await request(app)
      .post("/api/nfcore/uninstall")
      .send({ id: "nf-core/fastqc" })
      .expect(400);
    await request(app)
      .post("/api/nfcore/uninstall")
      .send({ id: "nf-core/salmon/quant" })
      .expect(404);
    await request(app).post("/api/nfcore/uninstall").send({}).expect(400);
  });

  it("keeps the stored layout of modules installed from another commit", async () => {
    install("0000000");
    const response = await request(app).get("/api/nfcore/installed").expect(200);
    const manifest = response.body.installed[0].manifest;

    expect(manifest.outdated).toBe(true);
    expect(manifest.inputs).toEqual([
      { handle: "meta", nfcoreName: "meta", adapter: "path" },
    ]);
  });
});
