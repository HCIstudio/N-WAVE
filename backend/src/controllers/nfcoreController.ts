import type { Request, Response } from "express";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { findNfCoreModuleDir, getNwaveDataRoot } from "../execution/nfcoreModules";
import { getErrorMessage } from "../utils/errors";
import {
  installNfCoreModuleSchema,
  nfCoreModuleSourceQuerySchema,
} from "../validation/schemas";
import { parseBody } from "../validation/validate";

type SupportLevel = "full" | "candidate" | "needs_review" | "unsupported";

interface NfCoreInputGroup {
  argumentIndex: number;
  handle: string;
  tuple: boolean;
  metaName: string | null;
  /** Path field names (the node's input ports). */
  fields: string[];
  /** Full argument layout (meta, path and val items); catalog schema 2+. */
  items?: Array<{ kind: "meta" | "path" | "val"; name: string }>;
}

interface NfCoreCatalogEntry {
  id: string;
  moduleName: string;
  modulePath: string;
  label: string;
  description: string;
  processName: string;
  source: {
    repository: string;
    ref: string;
    commit: string;
    path: string;
  };
  files: {
    main: boolean;
    meta: boolean;
    environment: boolean;
  };
  keywords: string[];
  tools: string[];
  inputs: string[];
  inputDeclarations?: string[];
  inputGroups?: NfCoreInputGroup[];
  valueInputs?: Array<{
    name: string;
    type: string;
    description?: string;
    defaultValue: string | number | boolean;
  }>;
  outputs: string[];
  emits: string[];
  containers: string[];
  settings?: {
    extArgs: boolean;
    extArgNames?: string[];
    argumentReferences?: Array<{
      type: string;
      url: string;
    }>;
    resources: boolean;
  };
  installedByDefault: boolean;
  support: SupportLevel;
  installability?: {
    automatic: boolean;
    requiresReview: boolean;
    reasons: string[];
  };
}

interface NfCoreCatalog {
  schemaVersion: number;
  generatedAt: string;
  source: {
    repository: string;
    ref: string;
    commit: string;
  };
  counts: Record<string, number>;
  modules: NfCoreCatalogEntry[];
}

interface InstalledModuleIndexEntry {
  id: string;
  installedAt: string;
  moduleDir: string;
  manifestPath: string;
  sourceCommit: string;
  support: SupportLevel;
}

interface GitHubContentEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

const catalogCache = {
  value: null as NfCoreCatalog | null,
};

export const listNfCoreCatalog = (_req: Request, res: Response): void => {
  try {
    const catalog = loadCatalog();
    const installed = loadInstalledIndex();
    const installedIds = new Set([
      ...Object.keys(installed),
      ...catalog.modules
        .filter((entry) => entry.installedByDefault)
        .map((entry) => entry.id),
    ]);

    res.json({
      ...catalog,
      modules: catalog.modules.map((entry) => ({
        ...entry,
        installed: installedIds.has(entry.id),
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to load nf-core catalog",
      error: getErrorMessage(error),
    });
  }
};

export const listInstalledNfCoreModules = (
  _req: Request,
  res: Response
): void => {
  try {
    const catalog = loadCatalog();
    const installed = loadInstalledIndex();
    const bundled = catalog.modules
      .filter((entry) => entry.installedByDefault)
      .map((entry) => ({
        id: entry.id,
        bundled: true,
        support: entry.support,
        modulePath: entry.modulePath,
        sourceCommit: entry.source.commit,
      }));

    res.json({
      dataRoot: getNwaveDataRoot(),
      bundled,
      installed: Object.values(installed).map((entry) => ({
        ...entry,
        manifest: enrichInstalledManifest(
          readJsonIfExists(entry.manifestPath),
          catalog.modules.find((moduleEntry) => moduleEntry.id === entry.id),
          entry.sourceCommit
        ),
      })),
    });
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to list installed nf-core modules",
      error: getErrorMessage(error),
    });
  }
};

export const installNfCoreModule = async (
  req: Request,
  res: Response
): Promise<void> => {
  const body = parseBody(installNfCoreModuleSchema, req, res);
  if (!body) return;

  try {
    const moduleId = body.id;

    const catalog = loadCatalog();
    const entry = catalog.modules.find((moduleEntry) => moduleEntry.id === moduleId);
    if (!entry) {
      res.status(404).json({ message: `Unknown nf-core module: ${moduleId}` });
      return;
    }
    if (entry.support === "unsupported" || entry.installability?.automatic === false) {
      res.status(400).json({
        message: `${moduleId} cannot be installed automatically`,
        reasons: entry.installability?.reasons ?? [],
      });
      return;
    }

    const installRoot = getInstalledModuleRoot(entry);
    const tempRoot = `${installRoot}.tmp`;
    ensureInside(getNwaveDataRoot(), installRoot);

    if (fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(tempRoot, { recursive: true });

    await downloadGitHubDirectory(entry, tempRoot);

    const manifest = buildAdapterManifest(entry);
    const manifestPath = path.join(tempRoot, "nwave.adapter.json");
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    if (fs.existsSync(installRoot)) {
      fs.rmSync(installRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(installRoot), { recursive: true });
    fs.renameSync(tempRoot, installRoot);

    const index = loadInstalledIndex();
    const installedEntry: InstalledModuleIndexEntry = {
      id: entry.id,
      installedAt: new Date().toISOString(),
      moduleDir: installRoot,
      manifestPath: path.join(installRoot, "nwave.adapter.json"),
      sourceCommit: entry.source.commit,
      support: entry.support,
    };
    index[entry.id] = installedEntry;
    writeInstalledIndex(index);

    res.status(201).json({
      module: entry,
      installed: installedEntry,
      manifest,
    });
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to install nf-core module",
      error: getErrorMessage(error),
    });
  }
};

/** Remove an installed module's files and its entry in the install index. */
export const uninstallNfCoreModule = (req: Request, res: Response): void => {
  const body = parseBody(installNfCoreModuleSchema, req, res);
  if (!body) return;

  try {
    const index = loadInstalledIndex();
    const installed = index[body.id];
    if (!installed) {
      const bundled = loadCatalog().modules.some(
        (entry) => entry.id === body.id && entry.installedByDefault
      );
      res.status(bundled ? 400 : 404).json({
        message: bundled
          ? `${body.id} is bundled with N-WAVE and can't be removed`
          : `nf-core module ${body.id} is not installed`,
      });
      return;
    }

    const moduleRoot = path.resolve(installed.moduleDir);
    ensureInside(path.join(getNwaveDataRoot(), "nf-core", "modules"), moduleRoot);
    fs.rmSync(moduleRoot, { recursive: true, force: true });
    delete index[body.id];
    writeInstalledIndex(index);

    res.json({ id: body.id });
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to uninstall nf-core module",
      error: getErrorMessage(error),
    });
  }
};

export const getNfCoreModuleSource = (req: Request, res: Response): void => {
  const parsed = nfCoreModuleSourceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid module id",
      error: parsed.error.issues[0]?.message ?? "Invalid module id",
    });
    return;
  }

  const moduleName = parsed.data.id.replace(/^nf-core\//, "");
  const moduleDir = findNfCoreModuleDir(moduleName);
  if (!moduleDir) {
    res.status(404).json({
      message: `nf-core module ${parsed.data.id} is not installed`,
    });
    return;
  }

  try {
    res.json({
      id: parsed.data.id,
      source: fs.readFileSync(path.join(moduleDir, "main.nf"), "utf8"),
    });
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to read nf-core module source",
      error: getErrorMessage(error),
    });
  }
};

// Files of a module that a workflow needs to run it; tests/ and other
// directories are left out.
const MODULE_FILE_NAMES = ["main.nf", "meta.yml", "environment.yml"];

/**
 * The files of an installed or bundled module, for exporting a runnable
 * project: `{ id, files: { "main.nf": "...", ... } }`.
 */
export const getNfCoreModuleFiles = (req: Request, res: Response): void => {
  const parsed = nfCoreModuleSourceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid module id",
      error: parsed.error.issues[0]?.message ?? "Invalid module id",
    });
    return;
  }

  const moduleDir = findNfCoreModuleDir(parsed.data.id.replace(/^nf-core\//, ""));
  if (!moduleDir) {
    res.status(404).json({
      message: `nf-core module ${parsed.data.id} is not installed`,
    });
    return;
  }

  try {
    const files: Record<string, string> = {};
    for (const name of MODULE_FILE_NAMES) {
      const filePath = path.join(moduleDir, name);
      if (fs.existsSync(filePath)) {
        files[name] = fs.readFileSync(filePath, "utf8");
      }
    }
    res.json({ id: parsed.data.id, files });
  } catch (error: unknown) {
    res.status(500).json({
      message: "Failed to read nf-core module files",
      error: getErrorMessage(error),
    });
  }
};

const loadCatalog = (): NfCoreCatalog => {
  if (catalogCache.value) return catalogCache.value;

  const catalogPath = resolveCatalogPath();
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as NfCoreCatalog;
  catalogCache.value = catalog;
  return catalog;
};

const resolveCatalogPath = (): string => {
  const candidates = [
    path.join(process.cwd(), "dist", "workflows", "library", "assets", "nf-core", "catalog.json"),
    path.join(process.cwd(), "src", "workflows", "library", "assets", "nf-core", "catalog.json"),
  ];

  const catalogPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!catalogPath) {
    throw new Error(`nf-core catalog not found. Checked: ${candidates.join(", ")}`);
  }

  return catalogPath;
};


const getInstalledIndexPath = (): string =>
  path.join(getNwaveDataRoot(), "nf-core", "installed.json");

const getInstalledModuleRoot = (entry: NfCoreCatalogEntry): string =>
  path.join(
    getNwaveDataRoot(),
    "nf-core",
    "modules",
    "nf-core",
    ...entry.modulePath.split("/")
  );

const loadInstalledIndex = (): Record<string, InstalledModuleIndexEntry> => {
  const indexPath = getInstalledIndexPath();
  if (!fs.existsSync(indexPath)) return {};

  return JSON.parse(fs.readFileSync(indexPath, "utf8")) as Record<
    string,
    InstalledModuleIndexEntry
  >;
};

const writeInstalledIndex = (
  index: Record<string, InstalledModuleIndexEntry>
): void => {
  const indexPath = getInstalledIndexPath();
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
};

const readJsonIfExists = (filePath: string): unknown | null => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

/**
 * Refresh an installed module's manifest from the current catalog. The input
 * layout is only taken over when the installed files are from the catalog's
 * commit; otherwise the module's signature may differ, so the stored layout
 * is kept and the module is marked as outdated (reinstall to update).
 */
const enrichInstalledManifest = (
  manifest: unknown | null,
  catalogEntry?: NfCoreCatalogEntry,
  installedCommit?: string
): unknown | null => {
  if (!manifest || !catalogEntry || typeof manifest !== "object") {
    return manifest;
  }
  if (installedCommit && installedCommit !== catalogEntry.source.commit) {
    return { ...(manifest as Record<string, unknown>), outdated: true };
  }

  const currentManifest = manifest as Record<string, unknown>;
  const refreshedManifest = buildAdapterManifest(catalogEntry);

  return {
    ...currentManifest,
    support: refreshedManifest.support,
    needsReview: refreshedManifest.needsReview,
    installability: refreshedManifest.installability,
    settings: refreshedManifest.settings,
    source: refreshedManifest.source,
    inputGroups: refreshedManifest.inputGroups,
    valueInputs: refreshedManifest.valueInputs,
    inputs: refreshedManifest.inputs,
    defaults: {
      ...(currentManifest.defaults as Record<string, unknown> | undefined),
      nwaveNfCoreSupportsExtArgs:
        refreshedManifest.defaults.nwaveNfCoreSupportsExtArgs,
      nwaveNfCoreExtArgNames: refreshedManifest.defaults.nwaveNfCoreExtArgNames,
      nwaveNfCoreArgumentReferences:
        refreshedManifest.defaults.nwaveNfCoreArgumentReferences,
      nwaveNfCoreSupportsResources:
        refreshedManifest.defaults.nwaveNfCoreSupportsResources,
    },
  };
};

const downloadGitHubDirectory = async (
  entry: NfCoreCatalogEntry,
  targetDir: string
): Promise<void> => {
  const repoMatch = entry.source.repository.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/
  );
  const owner = repoMatch?.[1];
  const repo = repoMatch?.[2];
  if (!owner || !repo) {
    throw new Error(`Unsupported module repository: ${entry.source.repository}`);
  }

  await downloadGitHubContents({
    owner,
    repo,
    ref: entry.source.commit,
    sourcePath: entry.source.path,
    targetDir,
  });
};

const downloadGitHubContents = async ({
  owner,
  repo,
  ref,
  sourcePath,
  targetDir,
}: {
  owner: string;
  repo: string;
  ref: string;
  sourcePath: string;
  targetDir: string;
}): Promise<void> => {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponentPath(
    sourcePath
  )}?ref=${encodeURIComponent(ref)}`;
  const response = await axios.get<GitHubContentEntry[]>(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "N-WAVE-nfcore-installer",
    },
  });

  if (!Array.isArray(response.data)) {
    throw new Error(`Expected directory response for ${sourcePath}`);
  }

  for (const entry of response.data) {
    const targetPath = path.join(targetDir, entry.name);
    ensureInside(targetDir, targetPath);

    if (entry.type === "dir") {
      fs.mkdirSync(targetPath, { recursive: true });
      await downloadGitHubContents({
        owner,
        repo,
        ref,
        sourcePath: entry.path,
        targetDir: targetPath,
      });
      continue;
    }

    if (entry.type === "file" && entry.download_url) {
      const fileResponse = await axios.get<ArrayBuffer>(entry.download_url, {
        responseType: "arraybuffer",
      });
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, Buffer.from(fileResponse.data));
    }
  }
};

/**
 * Ports of a module: every path field of its inputs, in declaration order.
 * Older catalog entries without input groups fall back to meta.yml names.
 */
const getInputPorts = (entry: NfCoreCatalogEntry): string[] =>
  entry.inputGroups
    ? entry.inputGroups.flatMap((group) =>
        group.items
          ? group.items.flatMap((item) => (item.kind === "path" ? [item.name] : []))
          : group.fields
      )
    : entry.inputs;

// Mirrored in the frontend by buildNfCoreManifest
// (frontend/src/registry/nfcore/manifest.ts).
const buildAdapterManifest = (entry: NfCoreCatalogEntry) => ({
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  id: entry.id,
  label: entry.label,
  description: entry.description,
  processType: `nfcore_${entry.modulePath.replace(/[^A-Za-z0-9]+/g, "_")}`,
  modulePath: `./modules/nf-core/${entry.modulePath}/main`,
  processName: entry.processName,
  support: entry.support,
  needsReview: entry.support === "needs_review",
  installability: entry.installability,
  settings: entry.settings,
  source: entry.source,
  inputGroups: entry.inputGroups,
  valueInputs: entry.valueInputs ?? [],
  inputs: getInputPorts(entry).map((inputName) => ({
    handle: inputName,
    nfcoreName: inputName,
    adapter:
      !entry.inputGroups && inputName === "reads" ? "fastq_reads_with_meta" : "path",
    label: toTitle(inputName),
  })),
  outputs: entry.emits.map((emit) => ({
    handle: emit,
    emit,
    label: toTitle(emit),
  })),
  defaults: {
    label: entry.label,
    subtitle: "nf-core module",
    note: "Imported from nf-core catalog",
    nwaveExecutionBackend: "nf-core",
    nwaveNfCoreModuleId: entry.id,
    nwaveNfCoreSupportsExtArgs: entry.settings?.extArgs ?? false,
    nwaveNfCoreExtArgNames: entry.settings?.extArgNames ?? [],
    nwaveNfCoreArgumentReferences: entry.settings?.argumentReferences ?? [],
    nwaveNfCoreSupportsResources: entry.settings?.resources ?? true,
  },
});

const toTitle = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const encodeURIComponentPath = (value: string): string =>
  value.split("/").map(encodeURIComponent).join("/");

const ensureInside = (root: string, target: string): void => {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Refusing to write outside ${resolvedRoot}: ${resolvedTarget}`);
  }
};
