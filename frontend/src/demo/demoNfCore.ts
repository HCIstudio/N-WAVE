// nf-core support for the backend-less demo. Module sources come straight
// from GitHub at the commit the bundled catalog was generated from.

import catalogUrl from "../registry/nfcore/catalog.json?url";

interface CatalogSource {
  commit: string;
  path: string;
}

interface CatalogFile {
  modules: Array<{ id: string; source: CatalogSource }>;
}

let catalogPromise: Promise<CatalogFile> | null = null;

/**
 * The nf-core catalog (~5 MB), shipped as a static asset and fetched on first
 * use rather than bundled into the app's JavaScript.
 */
const loadCatalog = (): Promise<CatalogFile> => {
  catalogPromise ??= fetch(catalogUrl).then((response) => {
    if (!response.ok) {
      throw new Error(
        `Could not load the nf-core catalog (HTTP ${response.status}).`,
      );
    }
    return response.json() as Promise<CatalogFile>;
  });
  catalogPromise.catch(() => {
    catalogPromise = null;
  });
  return catalogPromise;
};

const sourceCache = new Map<string, Promise<string>>();

/** GitHub raw URL of a module file at the catalog's pinned commit. */
export const nfCoreModuleFileUrl = (source: CatalogSource, file: string) =>
  `https://raw.githubusercontent.com/nf-core/modules/${source.commit}/${source.path}/${file}`;

/** `main.nf` of an nf-core module (e.g. "nf-core/fastqc"), fetched once. */
export const fetchNfCoreModuleSource = (id: string): Promise<string> => {
  const cached = sourceCache.get(id);
  if (cached) return cached;

  const request = loadCatalog().then(async (catalog) => {
    const entry = catalog.modules.find((module) => module.id === id);
    if (!entry) throw new Error(`Unknown nf-core module: ${id}`);
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
