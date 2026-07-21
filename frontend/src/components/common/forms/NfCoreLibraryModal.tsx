import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  getNfCoreCatalog,
  installNfCoreModule,
  refreshInstalledNfCoreNodes,
  type NfCoreCatalogModule,
} from "../../../api/nfcore";
import DynamicIcon from "../ui/DynamicIcon";
import SearchInput from "./SearchInput";

interface NfCoreLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInstalled: () => void;
}

const supportLabels: Record<NfCoreCatalogModule["support"], string> = {
  full: "Ready",
  candidate: "Generated",
  needs_review: "Needs review",
  unsupported: "Unsupported",
};
const pageSize = 150;

const NfCoreLibraryModal: React.FC<NfCoreLibraryModalProps> = ({
  isOpen,
  onClose,
  onInstalled,
}) => {
  const [catalog, setCatalog] = useState<NfCoreCatalogModule[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);
    getNfCoreCatalog()
      .then((response) => setCatalog(response.modules))
      .catch((catalogError: any) => {
        setError(catalogError?.message || "Failed to load nf-core catalog");
      })
      .finally(() => setIsLoading(false));
  }, [isOpen]);

  const filteredModules = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const modules = normalizedSearch
      ? catalog.filter((module) => {
          const haystack = [
            module.id,
            module.label,
            module.description,
            module.processName,
            ...module.keywords,
            ...module.tools,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedSearch);
        })
      : catalog;

    return modules
      .slice()
      .sort((left, right) => {
        if (left.installed !== right.installed) return left.installed ? -1 : 1;
        if (left.support !== right.support) {
          return supportRank(left.support) - supportRank(right.support);
        }
        return left.id.localeCompare(right.id);
      });
  }, [catalog, searchTerm]);
  const pageCount = Math.max(1, Math.ceil(filteredModules.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleModules = filteredModules.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize
  );

  useEffect(() => {
    setPage(0);
  }, [searchTerm]);

  const handleInstall = async (module: NfCoreCatalogModule) => {
    setInstallingId(module.id);
    setError(null);
    try {
      await installNfCoreModule(module.id);
      await refreshInstalledNfCoreNodes();
      setCatalog((current) =>
        current.map((candidate) =>
          candidate.id === module.id
            ? { ...candidate, installed: true }
            : candidate
        )
      );
      onInstalled();
    } catch (installError: any) {
      setError(installError?.message || `Failed to install ${module.id}`);
    } finally {
      setInstallingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex max-h-[82vh] w-[min(980px,calc(100vw-2rem))] flex-col rounded-md border border-accent bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-accent px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-text">nf-core Library</h2>
            <p className="text-xs text-text-light">
              Install local module adapters from the pinned catalog.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-text-light hover:bg-accent hover:text-text"
            aria-label="Close nf-core library"
          >
            <DynamicIcon name="X" className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-accent p-3">
          <SearchInput
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search nf-core modules..."
          />
          <div className="mt-2 flex items-center justify-between text-xs text-text-light">
            <span>
              Showing {visibleModules.length} of {filteredModules.length} matches
            </span>
            {isLoading && <span>Loading catalog...</span>}
          </div>
          {error && (
            <div className="mt-2 rounded-md border border-red-500/40 bg-red-900/20 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        <div className="overflow-y-auto p-2">
          {visibleModules.map((module) => {
            const isInstalling = installingId === module.id;
            const isInstalled = Boolean(module.installed);
            const argumentReferences =
              module.settings?.argumentReferences ?? [];
            const canInstall =
              module.support !== "unsupported" &&
              module.installability?.automatic !== false &&
              !isInstalled;
            const installabilityText =
              module.installability?.automatic === false
                ? "Manual adapter needed"
                : module.installability?.requiresReview
                  ? "Auto install, review recommended"
                  : "Auto install";

            return (
              <div
                key={module.id}
                className="grid grid-cols-[1fr_auto] gap-3 border-b border-accent/60 px-3 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-text">
                      {module.label || module.modulePath}
                    </h3>
                    <span className="rounded-md border border-accent px-2 py-0.5 text-xs text-text-light">
                      {module.id}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs ${supportClass(
                        module.support
                      )}`}
                    >
                      {supportLabels[module.support]}
                    </span>
                    {isInstalled && (
                      <span className="rounded-md bg-nextflow-green/15 px-2 py-0.5 text-xs text-nextflow-green">
                        Installed
                      </span>
                    )}
                    <span className="rounded-md border border-accent px-2 py-0.5 text-xs text-text-light">
                      {installabilityText}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-text-light">
                    {module.description || "No description available."}
                  </p>
                  <p className="mt-1 text-xs text-text-light">
                    {module.processName || "No process"} - inputs{" "}
                    {module.inputs.length} - outputs {module.outputs.length}
                  </p>
                  {module.installability?.automatic === false &&
                    module.installability.reasons.length > 0 && (
                      <p className="mt-1 text-xs text-yellow-200">
                        {module.installability.reasons[0]}
                      </p>
                    )}
                  {argumentReferences.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {argumentReferences.map((reference) => (
                        <a
                          key={`${module.id}-${reference.type}-${reference.url}`}
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="rounded-md border border-accent px-2 py-1 text-xs text-nextflow-green hover:bg-accent"
                        >
                          {toReferenceLabel(reference.type)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!canInstall || isInstalling}
                  onClick={() => handleInstall(module)}
                  className="self-center rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isInstalling
                    ? "Installing..."
                    : isInstalled
                      ? "Installed"
                      : canInstall
                        ? "Install"
                        : "Needs config"}
                </button>
              </div>
            );
          })}

          {!isLoading && filteredModules.length === 0 && (
            <p className="p-6 text-center text-sm text-text-light">
              No nf-core modules match the current search.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-accent px-4 py-3 text-sm text-text-light">
          <span>
            Page {currentPage + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="rounded-md border border-accent px-3 py-1.5 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() =>
                setPage((value) => Math.min(pageCount - 1, value + 1))
              }
              className="rounded-md border border-accent px-3 py-1.5 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const supportRank = (support: NfCoreCatalogModule["support"]): number => {
  if (support === "full") return 0;
  if (support === "candidate") return 1;
  if (support === "needs_review") return 2;
  return 3;
};

const supportClass = (support: NfCoreCatalogModule["support"]): string => {
  if (support === "full") return "bg-nextflow-green/15 text-nextflow-green";
  if (support === "unsupported") return "bg-red-900/30 text-red-200";
  return "bg-yellow-900/30 text-yellow-200";
};

const toReferenceLabel = (type?: string): string => {
  if (type === "documentation") return "Documentation";
  if (type === "tool_dev_url") return "Source";
  if (type === "homepage") return "Homepage";
  return "Reference";
};

export default NfCoreLibraryModal;
