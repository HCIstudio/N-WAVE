import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import {
  ensureModulesInstalled,
  ensureSubworkflowsInstalled,
  findCatalogEntry,
  findSubworkflowEntry,
  installModule,
  installSubworkflow,
  NfCoreLibraryError,
} from "../nfcore/library";

// nf-core module and subworkflow files are fetched from
// raw.githubusercontent.com; serve stand-ins: "<file> of <path>", and a 404
// for salmon/quant's meta.yml.
const githubRequests: string[] = [];
vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  const get = vi.fn(async (url: string) => {
    githubRequests.push(url);
    const parts =
      url.split("/modules/nf-core/")[1] ??
      url.split("/subworkflows/nf-core/")[1] ??
      "";
    if (!parts || parts === "salmon/quant/meta.yml") {
      throw Object.assign(new actual.AxiosError("Not Found"), {
        response: { status: 404 },
      });
    }
    // A main.nf holds a process or workflow (the installer checks).
    const kind = path.basename(url) === "main.nf" ? "process " : "";
    return {
      data: Buffer.from(`${kind}${path.basename(url)} of ${parts}`),
      headers: { "content-type": "text/plain; charset=utf-8" },
    };
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
const subworkflowDir = (name: string) =>
  path.join(dataDir, "nf-core/subworkflows/nf-core", name);
/** Install temp dirs left next to an install dir. */
const tempDirsNextTo = (dir: string) =>
  fs
    .readdirSync(path.dirname(dir))
    .filter((name) => name.startsWith(`${path.basename(dir)}.tmp`));

describe("GET /api/nfcore/modules/source", () => {
  it("fetches the main.nf and meta.yml of a module that isn't installed from GitHub", async () => {
    const response = await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/fastqc" })
      .expect(200);
    expect(response.body).toEqual({
      id: "nf-core/fastqc",
      source: "process main.nf of fastqc/main.nf",
      meta: "meta.yml of fastqc/meta.yml",
    });
    // Only main.nf and meta.yml are downloaded, at the catalog's pinned commit.
    expect(githubRequests).toHaveLength(2);
    expect(githubRequests[0]).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/nf-core\/modules\/[0-9a-f]{40}\/modules\/nf-core\/fastqc\/main\.nf$/
    );
  });

  it("leaves out a meta.yml GitHub doesn't have", async () => {
    const response = await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/salmon/quant" })
      .expect(200);
    expect(response.body).toEqual({
      id: "nf-core/salmon/quant",
      source: "process main.nf of salmon/quant/main.nf",
    });
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
    expect(tempDirsNextTo(dir)).toEqual([]);

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
          reasons: ["Unsupported input"],
        },
      })
    ).rejects.toMatchObject({ status: 400, reasons: ["Unsupported input"] });
    expect(fs.existsSync(moduleDir("fastqc"))).toBe(false);
  });

  it("lets a second install of the same module wait for the first", async () => {
    const entry = findCatalogEntry("nf-core/fastqc");
    if (!entry) throw new Error("nf-core/fastqc is not in the catalog");
    const [first, second] = await Promise.all([
      installModule(entry),
      installModule(entry),
    ]);
    expect(second).toBe(first);
    const dir = moduleDir("fastqc");
    for (const file of ["main.nf", "meta.yml", "nwave.adapter.json"]) {
      expect(fs.existsSync(path.join(dir, file))).toBe(true);
    }
    expect(tempDirsNextTo(dir)).toEqual([]);
    // Each file was downloaded once.
    expect(new Set(githubRequests).size).toBe(githubRequests.length);

    // Once it's done, installing again reinstalls.
    githubRequests.length = 0;
    await installModule(entry);
    expect(githubRequests.length).toBeGreaterThan(0);
  });

  it("lets a run's install of a subworkflow wait for one already running", async () => {
    const entry = findSubworkflowEntry("nf-core/subworkflows/bam_stats_samtools");
    if (!entry) throw new Error("bam_stats_samtools is not in the catalog");
    await Promise.all([
      installSubworkflow(entry),
      ensureSubworkflowsInstalled(["bam_stats_samtools"]),
    ]);
    const dir = subworkflowDir("bam_stats_samtools");
    expect(fs.existsSync(path.join(dir, "main.nf"))).toBe(true);
    expect(fs.existsSync(path.join(moduleDir("samtools/stats"), "main.nf"))).toBe(
      true
    );
    expect(tempDirsNextTo(dir)).toEqual([]);
    expect(new Set(githubRequests).size).toBe(githubRequests.length);
  });

  it("removes the temp dir of a failed install", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("socket hang up"));
    await request(app)
      .post("/api/nfcore/install")
      .send({ id: "nf-core/fastqc" })
      .expect(500);
    expect(fs.existsSync(moduleDir("fastqc"))).toBe(false);
    expect(tempDirsNextTo(moduleDir("fastqc"))).toEqual([]);
  });

  it.each(["constructor", "__proto__", "toString"])(
    "answers 404 for uninstalling %j",
    async (id) => {
      await request(app).post("/api/nfcore/uninstall").send({ id }).expect(404);
    }
  );

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
      "process main.nf of fastqc/main.nf"
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
      path.join(__dirname, "../../../frontend/src/registry/nfcore/catalog.json"),
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

describe("nf-core subworkflows", () => {
  const installedIds = async () =>
    (await request(app).get("/api/nfcore/installed").expect(200)).body.installed
      .map((entry: { id: string }) => entry.id)
      .sort();

  it("lists subworkflows in the catalog", async () => {
    const response = await request(app).get("/api/nfcore/catalog").expect(200);
    const entry = response.body.subworkflows.find(
      (candidate: { id: string }) =>
        candidate.id === "nf-core/subworkflows/bam_sort_stats_samtools"
    );
    expect(entry).toMatchObject({
      kind: "subworkflow",
      workflowName: "BAM_SORT_STATS_SAMTOOLS",
      installed: false,
      components: {
        modules: ["samtools/index", "samtools/sort"],
        subworkflows: ["bam_stats_samtools"],
      },
    });
    expect(entry.takes.map((take: { name: string }) => take.name)).toEqual([
      "ch_bam",
      "ch_fasta_fai",
    ]);
  });

  it("installs a subworkflow with the modules and subworkflows it includes", async () => {
    const response = await request(app)
      .post("/api/nfcore/install")
      .send({ id: "nf-core/subworkflows/bam_sort_stats_samtools" })
      .expect(201);
    expect(response.body.manifest).toMatchObject({
      kind: "subworkflow",
      processName: "BAM_SORT_STATS_SAMTOOLS",
      modulePath: "./subworkflows/nf-core/bam_sort_stats_samtools/main",
      inputs: [{ handle: "ch_bam" }, { handle: "ch_fasta_fai" }],
    });
    expect(response.body.dependencies.sort()).toEqual([
      "nf-core/samtools/flagstat",
      "nf-core/samtools/idxstats",
      "nf-core/samtools/index",
      "nf-core/samtools/sort",
      "nf-core/samtools/stats",
      "nf-core/subworkflows/bam_stats_samtools",
    ]);
    expect(
      fs.readFileSync(
        path.join(subworkflowDir("bam_sort_stats_samtools"), "main.nf"),
        "utf8"
      )
    ).toBe("process main.nf of bam_sort_stats_samtools/main.nf");
    expect(fs.existsSync(path.join(moduleDir("samtools/stats"), "main.nf"))).toBe(
      true
    );
    expect(await installedIds()).toEqual([
      "nf-core/samtools/flagstat",
      "nf-core/samtools/idxstats",
      "nf-core/samtools/index",
      "nf-core/samtools/sort",
      "nf-core/samtools/stats",
      "nf-core/subworkflows/bam_sort_stats_samtools",
      "nf-core/subworkflows/bam_stats_samtools",
    ]);

    await request(app)
      .post("/api/nfcore/uninstall")
      .send({ id: "nf-core/subworkflows/bam_sort_stats_samtools" })
      .expect(200);
    expect(fs.existsSync(subworkflowDir("bam_sort_stats_samtools"))).toBe(false);
    // What it brought in stays installed.
    expect(fs.existsSync(subworkflowDir("bam_stats_samtools"))).toBe(true);
  });

  it("serves a subworkflow's source and files", async () => {
    const source = await request(app)
      .get("/api/nfcore/modules/source")
      .query({ id: "nf-core/subworkflows/bam_stats_samtools" })
      .expect(200);
    expect(source.body.source).toBe("process main.nf of bam_stats_samtools/main.nf");
    expect(githubRequests[0]).toMatch(
      /\/[0-9a-f]{40}\/subworkflows\/nf-core\/bam_stats_samtools\/main\.nf$/
    );

    const files = await request(app)
      .get("/api/nfcore/modules/files")
      .query({ id: "nf-core/subworkflows/quantify_pseudo_alignment" })
      .expect(200);
    expect(Object.keys(files.body.files).sort()).toEqual([
      "main.nf",
      "meta.yml",
      "nextflow.config",
    ]);
  });

  it("refuses subworkflows that need a plugin", async () => {
    const response = await request(app)
      .post("/api/nfcore/install")
      .send({ id: "nf-core/subworkflows/utils_nfschema_plugin" })
      .expect(400);
    expect(response.body.reasons).toEqual([
      "Includes from a plugin: plugin/nf-schema",
    ]);
    await request(app)
      .post("/api/nfcore/install")
      .send({ id: "nf-core/subworkflows/nope" })
      .expect(404);
  });

  it("installs missing subworkflows and their includes before a run", async () => {
    // Installed earlier, but a module it includes was removed since.
    fs.mkdirSync(subworkflowDir("bam_stats_samtools"), { recursive: true });
    fs.writeFileSync(
      path.join(subworkflowDir("bam_stats_samtools"), "main.nf"),
      "workflow BAM_STATS_SAMTOOLS {}"
    );
    for (const module of ["samtools/stats", "samtools/flagstat"]) {
      fs.mkdirSync(moduleDir(module), { recursive: true });
      fs.writeFileSync(path.join(moduleDir(module), "main.nf"), "process X {}");
    }

    expect(await ensureSubworkflowsInstalled(["bam_stats_samtools"])).toEqual([
      "nf-core/samtools/idxstats",
    ]);
    expect(
      (await ensureSubworkflowsInstalled(["quantify_pseudo_alignment"])).sort()
    ).toEqual(
      expect.arrayContaining([
        "nf-core/salmon/quant",
        "nf-core/subworkflows/quant_tximport_summarizedexperiment",
        "nf-core/subworkflows/quantify_pseudo_alignment",
      ])
    );
    await expect(ensureSubworkflowsInstalled(["nope"])).rejects.toThrow(
      "not in the catalog"
    );
  });
});
