import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { findNfCoreModuleDir } from "../execution/nfcoreModules";
import {
  ensureModulesInstalled,
  findCatalogEntry,
  installModule,
  loadInstalledIndex,
  readModuleFiles,
  resolveInstalledPath,
  writeInstalledIndex,
} from "./library";

describe("installed nf-core components", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-installed-"));
    vi.stubEnv("NWAVE_DATA_DIR", root);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const entry = (moduleDir: string) => ({
    id: "nf-core/fastqc",
    kind: "module" as const,
    installedAt: "2026-10-01T00:00:00.000Z",
    moduleDir,
    manifestPath: `${moduleDir}/nwave.adapter.json`,
    sourceCommit: "abc",
    support: "candidate" as never,
  });

  it("are found under a moved data directory", () => {
    // Written by an older version, before the data directory moved.
    const old = "/old/volume/data/nf-core/modules/nf-core/fastqc";
    expect(resolveInstalledPath(old, root)).toBe(path.join(root, "nf-core/modules/nf-core/fastqc"));
    expect(resolveInstalledPath("nf-core/subworkflows/nf-core/x", root)).toBe(path.join(root, "nf-core/subworkflows/nf-core/x"));
    expect(resolveInstalledPath("/elsewhere/file", root)).toBe("/elsewhere/file");

    fs.mkdirSync(path.join(root, "nf-core"), { recursive: true });
    fs.writeFileSync(path.join(root, "nf-core", "installed.json"), JSON.stringify({ "nf-core/fastqc": entry(old) }));
    const loaded = loadInstalledIndex()["nf-core/fastqc"];
    expect(loaded?.moduleDir).toBe(path.join(root, "nf-core/modules/nf-core/fastqc"));
    expect(loaded?.manifestPath).toBe(path.join(root, "nf-core/modules/nf-core/fastqc/nwave.adapter.json"));

    // Saved again, the paths are relative to the data directory.
    writeInstalledIndex(loadInstalledIndex());
    const stored = JSON.parse(fs.readFileSync(path.join(root, "nf-core", "installed.json"), "utf8"));
    expect(stored["nf-core/fastqc"].moduleDir).toBe("nf-core/modules/nf-core/fastqc");
  });

  it("export the files their install has, also ones the current catalog doesn't list", async () => {
    const dir = path.join(root, "nf-core", "modules", "nf-core", "fastqc");
    fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
    fs.writeFileSync(path.join(dir, "main.nf"), "process FASTQC {}\n");
    fs.writeFileSync(path.join(dir, "templates", "old_helper.py"), "print('older')\n");
    fs.writeFileSync(path.join(dir, "nwave.adapter.json"), "{}");
    writeInstalledIndex({ "nf-core/fastqc": entry(dir) });

    const files = await readModuleFiles("nf-core/fastqc");
    expect(Object.keys(files).sort()).toEqual(["main.nf", "templates/old_helper.py"]);
    expect(Object.keys(await readModuleFiles("nf-core/fastqc", ["main.nf"]))).toEqual(["main.nf"]);
  });
});

describe("installing an nf-core module", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-install-"));
    vi.stubEnv("NWAVE_DATA_DIR", root);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const serve = (data: string, headers: Record<string, string>) =>
    vi.spyOn(axios, "get").mockResolvedValue({ data: Buffer.from(data), headers, status: 200 });

  it("refuses a web page served instead of a file", async () => {
    // A captive portal or proxy answering with its own page.
    serve("<html>Sign in to the network</html>", { "content-type": "text/html" });
    const entry = findCatalogEntry("nf-core/fastqc");
    if (!entry) throw new Error("fastqc missing from the catalog");
    await expect(installModule(entry)).rejects.toThrow(/web page/);
    expect(findNfCoreModuleDir("fastqc")).toBeNull();
  });

  it("stops when its run is cancelled, leaving nothing half-installed", async () => {
    // The first file arrives; the second only ends when it is stopped.
    let calls = 0;
    vi.spyOn(axios, "get").mockImplementation(async (_url, config) => {
      calls += 1;
      if (calls === 1) {
        return { data: Buffer.from("process FASTQC {}\n"), headers: {}, status: 200 };
      }
      return new Promise((_, reject) => {
        config?.signal?.addEventListener?.("abort", () => reject(new Error("canceled")));
      });
    });
    const announced: string[] = [];
    const controller = new AbortController();
    const install = ensureModulesInstalled(["fastqc"], {
      signal: controller.signal,
      onInstall: (id) => announced.push(id),
    });
    await vi.waitFor(() => expect(calls).toBe(2));
    controller.abort();
    await expect(install).rejects.toThrow("canceled");
    expect(announced).toEqual(["nf-core/fastqc"]);
    expect(findNfCoreModuleDir("fastqc")).toBeNull();
    expect(loadInstalledIndex()["nf-core/fastqc"]).toBeUndefined();
    // No download folder is left behind.
    const modules = path.join(root, "nf-core", "modules", "nf-core");
    expect(fs.existsSync(modules) ? fs.readdirSync(modules) : []).toEqual([]);
  });

  it("lets a cancelled run stop waiting for an install someone else started", async () => {
    let finish: () => void = () => {};
    vi.spyOn(axios, "get").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({ data: Buffer.from("process FASTQC {}\n"), headers: {}, status: 200 });
        })
    );
    const entry = findCatalogEntry("nf-core/fastqc");
    if (!entry) throw new Error("fastqc missing from the catalog");
    // Installed from the nf-core library, while a run needs it too.
    const fromLibrary = installModule(entry);
    const controller = new AbortController();
    const fromRun = installModule(entry, controller.signal);
    controller.abort(new Error("run cancelled"));
    await expect(fromRun).rejects.toThrow("run cancelled");
    // The library's install goes on.
    vi.mocked(axios.get).mockResolvedValue({
      data: Buffer.from("process FASTQC {}\n"),
      headers: {},
      status: 200,
    });
    finish();
    await fromLibrary;
    expect(findNfCoreModuleDir("fastqc")).not.toBeNull();
  });

  it("asks for files uncompressed, so their length can be checked", async () => {
    const get = serve("process FASTQC {}\n", { "content-length": "18" });
    const entry = findCatalogEntry("nf-core/fastqc");
    if (!entry) throw new Error("fastqc missing from the catalog");
    await installModule(entry);
    for (const [, config] of get.mock.calls) {
      expect(config?.headers).toMatchObject({ "Accept-Encoding": "identity" });
    }
    expect(findNfCoreModuleDir("fastqc")).not.toBeNull();
  });

  it("refuses a main.nf cut off before its process", async () => {
    serve("// nf-core module\n", { "content-type": "text/plain" });
    const entry = findCatalogEntry("nf-core/fastqc");
    if (!entry) throw new Error("fastqc missing from the catalog");
    await expect(installModule(entry)).rejects.toThrow(/no process or workflow/);
    expect(findNfCoreModuleDir("fastqc")).toBeNull();
  });
});
