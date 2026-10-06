import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { getNwaveDataRoot } from "../execution/nfcoreModules";
import {
  buildAdapterManifest,
  ensureInside,
  findCatalogEntry,
  installModule,
  loadCatalog,
  loadInstalledIndex,
  type NfCoreCatalogEntry,
  NfCoreLibraryError,
  readModuleFiles,
  writeInstalledIndex,
} from "../nfcore/library";
import { getErrorMessage } from "../utils/errors";
import {
  installNfCoreModuleSchema,
  nfCoreModuleSourceQuerySchema,
} from "../validation/schemas";
import { parseBody } from "../validation/validate";

/** Answer with a library error's status, or 500 with `fallback`. */
const sendError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof NfCoreLibraryError) {
    res.status(error.status).json({
      message: error.message,
      ...(error.reasons.length > 0 ? { reasons: error.reasons } : {}),
    });
    return;
  }
  res.status(500).json({ message: fallback, error: getErrorMessage(error) });
};

export const listNfCoreCatalog = (_req: Request, res: Response): void => {
  try {
    const catalog = loadCatalog();
    const installedIds = new Set(Object.keys(loadInstalledIndex()));
    res.json({
      ...catalog,
      modules: catalog.modules.map((entry) => ({
        ...entry,
        installed: installedIds.has(entry.id),
      })),
    });
  } catch (error: unknown) {
    sendError(res, error, "Failed to load nf-core catalog");
  }
};

export const listInstalledNfCoreModules = (
  _req: Request,
  res: Response
): void => {
  try {
    res.json({
      dataRoot: getNwaveDataRoot(),
      installed: Object.values(loadInstalledIndex()).map((entry) => ({
        ...entry,
        manifest: enrichInstalledManifest(
          readJsonIfExists(entry.manifestPath),
          findCatalogEntry(entry.id),
          entry.sourceCommit
        ),
      })),
    });
  } catch (error: unknown) {
    sendError(res, error, "Failed to list installed nf-core modules");
  }
};

export const installNfCoreModule = async (
  req: Request,
  res: Response
): Promise<void> => {
  const body = parseBody(installNfCoreModuleSchema, req, res);
  if (!body) return;

  try {
    const entry = findCatalogEntry(body.id);
    if (!entry) {
      throw new NfCoreLibraryError(404, `Unknown nf-core module: ${body.id}`);
    }
    const { installed, manifest } = await installModule(entry);
    res.status(201).json({ module: entry, installed, manifest });
  } catch (error: unknown) {
    sendError(res, error, "Failed to install nf-core module");
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
      throw new NfCoreLibraryError(404, `nf-core module ${body.id} is not installed`);
    }

    const moduleRoot = path.resolve(installed.moduleDir);
    ensureInside(path.join(getNwaveDataRoot(), "nf-core", "modules"), moduleRoot);
    fs.rmSync(moduleRoot, { recursive: true, force: true });
    delete index[body.id];
    writeInstalledIndex(index);

    res.json({ id: body.id });
  } catch (error: unknown) {
    sendError(res, error, "Failed to uninstall nf-core module");
  }
};

const parseModuleId = (req: Request, res: Response): string | null => {
  const parsed = nfCoreModuleSourceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid module id",
      error: parsed.error.issues[0]?.message ?? "Invalid module id",
    });
    return null;
  }
  return parsed.data.id;
};

/** `{ id, source }`: a module's main.nf (installed copy or GitHub). */
export const getNfCoreModuleSource = async (
  req: Request,
  res: Response
): Promise<void> => {
  const id = parseModuleId(req, res);
  if (!id) return;
  try {
    const files = await readModuleFiles(id, ["main.nf"]);
    res.json({ id, source: files["main.nf"] });
  } catch (error: unknown) {
    sendError(res, error, "Failed to read nf-core module source");
  }
};

/**
 * `{ id, files }`: every file a module needs to run (main.nf, meta.yml,
 * environment.yml, templates/...), for exporting a runnable project.
 */
export const getNfCoreModuleFiles = async (
  req: Request,
  res: Response
): Promise<void> => {
  const id = parseModuleId(req, res);
  if (!id) return;
  try {
    res.json({ id, files: await readModuleFiles(id) });
  } catch (error: unknown) {
    sendError(res, error, "Failed to read nf-core module files");
  }
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
