import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import {
  ensureModulesInstalled,
  findCatalogEntry,
  installModule,
  NfCoreLibraryError,
} from "../nfcore/library";

// nf-core module files are fetched from raw.githubusercontent.com; serve
// stand-ins: "<file> of <module path>", and a 404 for salmon/quant's meta.yml.
const githubRequests: string[] = [];
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  const get = vi.fn(async (url: string) => {
    githubRequests.push(url);
    const match = url.match(/\/modules\/nf-core\/(.+?)\/([^/]+(?:\/[^/]+)?)$/);
    const parts = url.split("/modules/nf-core/")[1] ?? "";
    if (!match || parts === "salmon/quant/meta.yml") {
      throw Object.assign(new actual.AxiosError("Not Found"), {
        response: { status: 404 },
      });
    }
    return { data: Buffer.from(`${path.basename(url)} of ${parts}`) };
  });
  return {
    ...actual,
    default: { ...actual.default, get, isAxiosError: actual.isAxiosError },
  };
});

const app = createApp();
let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-nfcore-"));
  vi.stubEnv("NWAVE_DATA_DIR", dataDir);
  githubRequests.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const moduleDir = (modulePath: string) =>
  path.join(dataDir, "nf-core/modules/nf-core", modulePath);

describe("GET /api/nfcore/modules/source", () => {
  it("fetches the main.nf of a module that isn't installed from GitHub", async () => {
    const response = await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/fastqc" })
      .expect(200);
    expect(response.body).toEqual({
      id: "nf-core/fastqc",
      source: "main.nf of fastqc/main.nf",
    });
    // Only main.nf is downloaded, at the catalog's pinned commit.
    expect(githubRequests).toHaveLength(1);
    expect(githubRequests[0]).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/nf-core\/modules\/[0-9a-f]{40}\/modules\/nf-core\/fastqc\/main\.nf$/
    );
  });

  it("reads installed modules from disk", async () => {
    fs.mkdirSync(moduleDir("fastqc"), { recursive: true });
    fs.writeFileSync(path.join(moduleDir("fastqc"), "main.nf"), "process FASTQC {}");
    const response = await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/fastqc" })
      .expect(200);
    expect(response.body.source).toBe("process FASTQC {}");
    expect(githubRequests).toEqual([]);
  });

  it("reports unknown modules", async () => {
    await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/does-not-exist" })
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
  it("returns every file a module needs, templates included", async () => {
    const response = await request(app)
      .get("/api/nfcore/modules/files")
      .query({ id: "nf-core/tximeta/tximport" })
      .expect(200);
    expect(Object.keys(response.body.files).sort()).toEqual([
      "environment.yml",
      "main.nf",
      "meta.yml",
      "templates/tximport.r",
    ]);
  });

  it("skips optional files GitHub doesn't have", async () => {
    const response = await request(app)
      .get("/api/nfcore/modules/files")
      .query({ id: "nf-core/salmon/quant" })
      .expect(200);
    expect(Object.keys(response.body.files).sort()).toEqual([
      "environment.yml",
      "main.nf",
    ]);
  });

  it("rejects bad ids", async () => {
    await request(app)
      .get("/api/nfcore/modules/files")
      .query({ id: "nf-core/../x" })
      .expect(400);
  });
});

describe("installing nf-core modules", () => {
  it("installs a module's files, manifest and index entry", async () => {
    const response = await request(app)
      .post("/api/nfcore/install")
      .send({ id: "nf-core/custom/tx2gene" })
      .expect(201);
    expect(response.body.manifest.processName).toBe("CUSTOM_TX2GENE");

    const dir = moduleDir("custom/tx2gene");
    expect(fs.readFileSync(path.join(dir, "templates/tx2gene.py"), "utf8")).toBe(
      "tx2gene.py of custom/tx2gene/templates/tx2gene.py"
    );
    expect(fs.existsSync(path.join(dir, "nwave.adapter.json"))).toBe(true);
    expect(fs.existsSync(`${dir}.tmp`)).toBe(false);

    const installed = await request(app).get("/api/nfcore/installed").expect(200);
    expect(installed.body.installed.map((entry: { id: string }) => entry.id)).toEqual([
      "nf-core/custom/tx2gene",
    ]);
    const catalog = await request(app).get("/api/nfcore/catalog").expect(200);
    expect(
      catalog.body.modules.find(
        (entry: { id: string }) => entry.id === "nf-core/custom/tx2gene"
      ).installed
    ).toBe(true);
  });

  it("installs FastQC like any other module", async () => {
    await request(app)
      .post("/api/nfcore/install")
      .send({ id: "nf-core/fastqc" })
      .expect(201);
    await request(app)
      .post("/api/nfcore/uninstall")
      .send({ id: "nf-core/fastqc" })
      .expect(200, { id: "nf-core/fastqc" });
    expect(fs.existsSync(moduleDir("fastqc"))).toBe(false);
  });

  it("refuses modules that can't be installed automatically", async () => {
    const entry = findCatalogEntry("nf-core/fastqc");
    if (!entry) throw new Error("nf-core/fastqc is not in the catalog");
    await expect(
      installModule({
        ...entry,
        installability: {
          automatic: false,
          requiresReview: true,
          reasons: ["Unsupported input"],
        },
      })
    ).rejects.toMatchObject({ status: 400, reasons: ["Unsupported input"] });
    expect(fs.existsSync(moduleDir("fastqc"))).toBe(false);
  });

  it("reports unknown modules and ones that aren't installed", async () => {
    await request(app)
      .post("/api/nfcore/install")
      .send({ id: "nf-core/does-not-exist" })
      .expect(404);
    await request(app)
      .post("/api/nfcore/uninstall")
      .send({ id: "nf-core/salmon/quant" })
      .expect(404);
    await request(app).post("/api/nfcore/uninstall").send({}).expect(400);
  });
});

describe("ensureModulesInstalled", () => {
  it("installs only the modules that are missing", async () => {
    fs.mkdirSync(moduleDir("multiqc"), { recursive: true });
    fs.writeFileSync(path.join(moduleDir("multiqc"), "main.nf"), "process MULTIQC {}");

    expect(await ensureModulesInstalled(["fastqc", "multiqc"])).toEqual([
      "nf-core/fastqc",
    ]);
    expect(fs.readFileSync(path.join(moduleDir("fastqc"), "main.nf"), "utf8")).toBe(
      "main.nf of fastqc/main.nf"
    );
    expect(
      githubRequests.some((url) => url.includes("/modules/nf-core/multiqc/"))
    ).toBe(false);

    githubRequests.length = 0;
    expect(await ensureModulesInstalled(["fastqc"])).toEqual([]);
    expect(githubRequests).toEqual([]);
  });

  it("fails for modules that aren't in the catalog", async () => {
    const error = await ensureModulesInstalled(["not/a/module"]).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(NfCoreLibraryError);
    expect((error as NfCoreLibraryError).message).toContain("not in the catalog");
  });
});

describe("installed nf-core modules", () => {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../workflows/library/assets/nf-core/catalog.json"),
      "utf8"
    )
  ) as { source: { commit: string } };

  const writeInstalled = (sourceCommit: string) => {
    const dir = moduleDir("star/align");
    fs.mkdirSync(dir, { recursive: true });
    const manifestPath = path.join(dir, "nwave.adapter.json");
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
          moduleDir: dir,
          manifestPath,
          sourceCommit,
          support: "candidate",
        },
      })
    );
  };

  it("refreshes the input layout of modules installed from the catalog commit", async () => {
    writeInstalled(catalog.source.commit);
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

  it("keeps the stored layout of modules installed from another commit", async () => {
    writeInstalled("0000000");
    const response = await request(app).get("/api/nfcore/installed").expect(200);
    const manifest = response.body.installed[0].manifest;

    expect(manifest.outdated).toBe(true);
    expect(manifest.inputs).toEqual([
      { handle: "meta", nfcoreName: "meta", adapter: "path" },
    ]);
  });
});
