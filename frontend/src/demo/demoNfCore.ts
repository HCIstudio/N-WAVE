// nf-core support for the backend-less demo. Mirrors the backend's
// /api/nfcore responses: the catalog is a static asset fetched on first use,
// module and subworkflow sources come straight from GitHub at the catalog's
// pinned commit, and installed ones (adapter manifest + main.nf) live in
// localStorage.

import type {
  InstalledNfCoreModule,
  InstalledNfCoreResponse,
  NfCoreCatalogModule,
  NfCoreCatalogResponse,
  NfCoreCatalogSubworkflow,
} from "../api/nfcore";
import catalogUrl from "../registry/nfcore/catalog.json?url";
import { buildNfCoreManifest } from "../registry/nfcore/manifest";
import {
  buildNfCoreSubworkflowManifest,
  isNfCoreSubworkflowId,
} from "../registry/nfcore/subworkflow";
import type { NfCoreAdapterManifest } from "../registry/nfcoreModuleAdapters";
import { DemoStoreError } from "./demoStore";

const STORAGE_KEY = "nwave.demo.nfcore.installed";

interface CatalogSource {
  commit: string;
  path: string;
}

interface StoredModule {
  id: string;
  installedAt: string;
  sourceCommit: string;
  support: NfCoreCatalogModule["support"];
  manifest: NfCoreAdapterManifest;
  /** The module's main.nf, kept so the Code tab works after a reload. */
  source: string;
}

let catalogPromise: Promise<NfCoreCatalogResponse> | null = null;

/**
 * The nf-core catalog (~6 MB), shipped as a static asset and fetched on first
 * use rather than bundled into the app's JavaScript.
 */
const loadCatalog = (): Promise<NfCoreCatalogResponse> => {
  catalogPromise ??= fetch(catalogUrl).then((response) => {
    if (!response.ok) {
      throw new Error(
        `Could not load the nf-core catalog (HTTP ${response.status}).`,
      );
    }
    return response.json() as Promise<NfCoreCatalogResponse>;
  });
  catalogPromise.catch(() => {
    catalogPromise = null;
  });
  return catalogPromise;
};

/** A module or subworkflow from the catalog. */
const findEntry = async (
  id: string,
): Promise<NfCoreCatalogModule | NfCoreCatalogSubworkflow> => {
  const catalog = await loadCatalog();
  const entry = isNfCoreSubworkflowId(id)
    ? catalog.subworkflows?.find((subworkflow) => subworkflow.id === id)
    : catalog.modules.find((module) => module.id === id);
  if (!entry) {
    throw new DemoStoreError(
      404,
      `Unknown nf-core ${isNfCoreSubworkflowId(id) ? "subworkflow" : "module"}: ${id}`,
    );
  }
  return entry;
};

/** Every module and subworkflow a subworkflow includes, nested ones too. */
const resolveComponents = async (
  entry: NfCoreCatalogSubworkflow,
): Promise<{ modules: string[]; subworkflows: string[] }> => {
  const modules = new Set<string>();
  const subworkflows = new Set<string>();
  const visit = async (current: NfCoreCatalogSubworkflow) => {
    for (const module of current.components.modules) modules.add(module);
    for (const name of current.components.subworkflows) {
      if (subworkflows.has(name)) continue;
      subworkflows.add(name);
      await visit(
        (await findEntry(
          `nf-core/subworkflows/${name}`,
        )) as NfCoreCatalogSubworkflow,
      );
    }
  };
  await visit(entry);
  return {
    modules: Array.from(modules).sort(),
    subworkflows: Array.from(subworkflows).sort(),
  };
};

const read = (): StoredModule[] => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? (parsed as StoredModule[]) : [];
  } catch {
    return [];
  }
};

const write = (modules: StoredModule[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
};

/** GitHub raw URL of a module file at the catalog's pinned commit. */
export const nfCoreModuleFileUrl = (source: CatalogSource, file: string) =>
  `https://raw.githubusercontent.com/nf-core/modules/${source.commit}/${source.path}/${file}`;

const sourceCache = new Map<string, Promise<string>>();

/**
 * `main.nf` of an nf-core module or subworkflow (e.g. "nf-core/fastqc"): the
 * stored copy of an installed one, otherwise fetched from GitHub once per
 * session.
 */
export const fetchNfCoreModuleSource = (id: string): Promise<string> => {
  const installed = read().find((module) => module.id === id);
  if (installed?.source) return Promise.resolve(installed.source);

  const cached = sourceCache.get(id);
  if (cached) return cached;

  const request = findEntry(id).then(async (entry) => {
    const response = await fetch(nfCoreModuleFileUrl(entry.source, "main.nf"));
    if (!response.ok) {
      throw new Error(
        `Could not load ${id} from GitHub (HTTP ${response.status}).`,
      );
    }
    return response.text();
  });
  // Don't cache failures, so a later attempt can succeed.
  request.catch(() => sourceCache.delete(id));
  sourceCache.set(id, request);
  return request;
};

// Files a module runs without; everything else (main.nf, templates/...) is
// required.
const OPTIONAL_MODULE_FILES = new Set([
  "meta.yml",
  "environment.yml",
  "nextflow.config",
]);

/**
 * Every file a module or subworkflow needs to run (main.nf, templates/...,
 * plus meta.yml and environment.yml when GitHub has them), for exporting a
 * runnable project.
 */
export const fetchNfCoreModuleFiles = async (
  id: string,
): Promise<Record<string, string>> => {
  const [entry, mainNf] = await Promise.all([
    findEntry(id),
    fetchNfCoreModuleSource(id),
  ]);
  const paths = (
    entry.files?.paths ?? ["main.nf", "meta.yml", "environment.yml"]
  ).filter((filePath) => filePath !== "main.nf");
  const files: Record<string, string> = { "main.nf": mainNf };
  await Promise.all(
    paths.map(async (filePath) => {
      const response = await fetch(
        nfCoreModuleFileUrl(entry.source, filePath),
      ).catch(() => null);
      if (response?.ok) {
        files[filePath] = await response.text();
      } else if (!OPTIONAL_MODULE_FILES.has(filePath)) {
        throw new Error(
          `Could not load ${filePath} of ${id} from GitHub (HTTP ${response?.status ?? "error"}).`,
        );
      }
    }),
  );
  return files;
};

const toInstalledEntry = (
  module: StoredModule,
  catalogCommit: string | undefined,
): InstalledNfCoreModule => ({
  id: module.id,
  installedAt: module.installedAt,
  sourceCommit: module.sourceCommit,
  support: module.support,
  manifest:
    catalogCommit && module.sourceCommit !== catalogCommit
      ? { ...module.manifest, outdated: true }
      : module.manifest,
});

export const demoNfCore = {
  async catalog(): Promise<NfCoreCatalogResponse> {
    const catalog = await loadCatalog();
    const installedIds = new Set(read().map((module) => module.id));
    return {
      ...catalog,
      modules: catalog.modules.map((module) => ({
        ...module,
        installed: installedIds.has(module.id),
      })),
      subworkflows: catalog.subworkflows?.map((subworkflow) => ({
        ...subworkflow,
        installed: installedIds.has(subworkflow.id),
      })),
    };
  },

  async installed(): Promise<InstalledNfCoreResponse> {
    const modules = read();
    // The catalog is only needed to flag outdated installs; skip it (and its
    // download) when nothing is installed.
    const catalogCommit =
      modules.length > 0 ? (await loadCatalog()).source?.commit : undefined;
    return {
      dataRoot: "browser",
      installed: modules.map((module) =>
        toInstalledEntry(module, catalogCommit),
      ),
    };
  },

  /**
   * Fetch the main.nf of a module or subworkflow and keep it with its
   * adapter manifest. A subworkflow brings in the modules and subworkflows
   * it includes that aren't installed yet (listed in `dependencies`).
   */
  async install(id: string): Promise<{
    module: NfCoreCatalogModule | NfCoreCatalogSubworkflow;
    installed: InstalledNfCoreModule;
    manifest: NfCoreAdapterManifest;
    dependencies: string[];
  }> {
    const entry = await findEntry(id);
    if (
      entry.support === "unsupported" ||
      entry.installability?.automatic === false
    ) {
      throw new DemoStoreError(400, `${id} cannot be installed automatically`);
    }

    const dependencies: string[] = [];
    if ("kind" in entry && entry.kind === "subworkflow") {
      const components = await resolveComponents(entry);
      const installedIds = new Set(read().map((module) => module.id));
      for (const dependency of [
        ...components.modules.map((module) => `nf-core/${module}`),
        ...components.subworkflows.map(
          (name) => `nf-core/subworkflows/${name}`,
        ),
      ]) {
        if (installedIds.has(dependency)) continue;
        // Nested subworkflows' own includes are part of `components`.
        await storeEntry(dependency);
        dependencies.push(dependency);
      }
    }
    return { ...(await storeEntry(id)), dependencies };
  },

  /** Remove an installed module or subworkflow. */
  async uninstall(id: string): Promise<{ id: string }> {
    const modules = read();
    if (!modules.some((module) => module.id === id)) {
      throw new DemoStoreError(404, `nf-core module ${id} is not installed`);
    }
    write(modules.filter((module) => module.id !== id));
    sourceCache.delete(id);
    return { id };
  },
};

/** Fetch an entry's main.nf and store it with its manifest. */
const storeEntry = async (
  id: string,
): Promise<{
  module: NfCoreCatalogModule | NfCoreCatalogSubworkflow;
  installed: InstalledNfCoreModule;
  manifest: NfCoreAdapterManifest;
}> => {
  const entry = await findEntry(id);
  const source = await fetchNfCoreModuleSource(id);
  const manifest =
    "kind" in entry && entry.kind === "subworkflow"
      ? buildNfCoreSubworkflowManifest(entry)
      : buildNfCoreManifest(entry as NfCoreCatalogModule);
  const stored: StoredModule = {
    id,
    installedAt: new Date().toISOString(),
    sourceCommit: entry.source.commit,
    support: entry.support,
    manifest,
    source,
  };
  write([...read().filter((module) => module.id !== id), stored]);
  return {
    module: entry,
    installed: toInstalledEntry(stored, entry.source.commit),
    manifest,
  };
};
