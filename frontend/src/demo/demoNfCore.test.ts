import fs from "node:fs";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type {
  InstalledNfCoreResponse,
  NfCoreCatalogResponse,
} from "../api/nfcore";
import type { NfCoreAdapterManifest } from "../registry/nfcoreModuleAdapters";
import demoApi from "./demoApi";

const catalogJson = fs.readFileSync(
  path.join(__dirname, "../registry/nfcore/catalog.json"),
  "utf8",
);
const githubRequests: string[] = [];

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.startsWith("https://raw.githubusercontent.com/")) {
        githubRequests.push(url);
        return new Response("process STAR_ALIGN {\n}\n");
      }
      return new Response(catalogJson);
    }),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const installed = async () =>
  (await demoApi.get<InstalledNfCoreResponse>("/nfcore/installed")).data
    .installed;

describe("demo nf-core library", () => {
  beforeEach(() => {
    localStorage.clear();
    githubRequests.length = 0;
  });

  it("lists the catalog with bundled modules installed", async () => {
    const { data } =
      await demoApi.get<NfCoreCatalogResponse>("/nfcore/catalog");
    expect(data.modules.length).toBeGreaterThan(2000);
    const byId = new Map(data.modules.map((module) => [module.id, module]));
    expect(byId.get("nf-core/fastqc")?.installed).toBe(true);
    expect(byId.get("nf-core/star/align")?.installed).toBe(false);
  });

  it("installs, lists and uninstalls a module", async () => {
    expect(await installed()).toEqual([]);

    const { data } = await demoApi.post<{ manifest: NfCoreAdapterManifest }>(
      "/nfcore/install",
      { id: "nf-core/star/align" },
    );
    expect(data.manifest.inputs.map((input) => input.handle)).toEqual([
      "reads",
      "index",
      "gtf",
    ]);
    expect(githubRequests).toHaveLength(1);
    expect(githubRequests[0]).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/nf-core\/modules\/[0-9a-f]{40}\/modules\/nf-core\/star\/align\/main\.nf$/,
    );

    const [entry] = await installed();
    expect(entry.id).toBe("nf-core/star/align");
    expect(entry.manifest?.processName).toBe("STAR_ALIGN");
    expect(entry.manifest?.outdated).toBeUndefined();

    const catalog = await demoApi.get<NfCoreCatalogResponse>("/nfcore/catalog");
    expect(
      catalog.data.modules.find((module) => module.id === "nf-core/star/align")
        ?.installed,
    ).toBe(true);

    await demoApi.post("/nfcore/uninstall", { id: "nf-core/star/align" });
    expect(await installed()).toEqual([]);
  });

  it("serves an installed module's source from storage", async () => {
    await demoApi.post("/nfcore/install", { id: "nf-core/salmon/quant" });
    githubRequests.length = 0;

    const { data } = await demoApi.get<{ source: string }>(
      `/nfcore/modules/source?id=${encodeURIComponent("nf-core/salmon/quant")}`,
    );
    expect(data.source).toContain("process STAR_ALIGN");
    expect(githubRequests).toEqual([]);
  });

  it("marks modules installed from another catalog commit as outdated", async () => {
    await demoApi.post("/nfcore/install", { id: "nf-core/salmon/quant" });
    const stored = JSON.parse(
      localStorage.getItem("nwave.demo.nfcore.installed") ?? "[]",
    );
    stored[0].sourceCommit = "0000000";
    localStorage.setItem("nwave.demo.nfcore.installed", JSON.stringify(stored));

    const [entry] = await installed();
    expect(entry.manifest?.outdated).toBe(true);
  });

  it("rejects bundled, unknown and missing ids", async () => {
    await expect(
      demoApi.post("/nfcore/install", { id: "nf-core/fastqc" }),
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      demoApi.post("/nfcore/install", { id: "nf-core/does-not-exist" }),
    ).rejects.toMatchObject({ response: { status: 404 } });
    await expect(
      demoApi.post("/nfcore/uninstall", { id: "nf-core/fastqc" }),
    ).rejects.toMatchObject({ response: { status: 400 } });
    await expect(
      demoApi.post("/nfcore/uninstall", { id: "nf-core/salmon/quant" }),
    ).rejects.toMatchObject({ response: { status: 404 } });
    await expect(demoApi.post("/nfcore/install", {})).rejects.toMatchObject({
      response: { status: 400 },
    });
  });
});
