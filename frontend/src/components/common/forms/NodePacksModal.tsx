import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isDemoMode } from "../../../api";
import { refreshCustomNodes } from "../../../api/customNodes";
import {
  fetchNodePackText,
  getMissingNfCoreComponents,
  importPackNodes,
  NODE_PACK_INDEX_URL,
  type NodePackImportResult,
  removeNodePack,
} from "../../../api/nodePacks";
import type { StoredCustomNode } from "../../../registry/customNodes";
import {
  buildNodePack,
  type ConflictChoice,
  defaultConflictChoice,
  findPackConflicts,
  groupInstalledPacks,
  type InstalledNodePack,
  type NodePackIndexEntry,
  nodePackFileName,
  type ParsedNodePack,
  parseNodePack,
  parseNodePackIndex,
  resolvePackImport,
  serializeNodePack,
} from "../../../registry/nodePacks";
import { getErrorMessage } from "../../../utils/errors";
import DynamicIcon from "../ui/DynamicIcon";

type Section = "installed" | "import" | "export";

interface NodePacksModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after nodes were imported or removed. */
  onChanged: () => void;
}

const downloadText = (text: string, fileName: string) => {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** The app version; read when needed, as tests don't define it. */
const appVersion = (): string =>
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

const inputClass =
  "w-full rounded-md border border-accent bg-background px-3 py-2 text-sm text-text";

/** Install, share and remove node packs (custom nodes as JSON files). */
const NodePacksModal: React.FC<NodePacksModalProps> = ({
  isOpen,
  onClose,
  onChanged,
}) => {
  const [section, setSection] = useState<Section>("installed");
  const [customNodes, setCustomNodes] = useState<StoredCustomNode[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setCustomNodes(await refreshCustomNodes());
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, "unknown error"));
    }
  }, []);

  useEffect(() => {
    if (isOpen) void reload();
  }, [isOpen, reload]);

  if (!isOpen) return null;

  const changed = async () => {
    await reload();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <dialog
        open
        aria-modal="true"
        aria-label="Node packs"
        className="relative m-0 flex p-0 text-text max-h-[82vh] w-[min(860px,calc(100vw-2rem))] flex-col rounded-md border border-accent bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-accent px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-text">Node packs</h2>
            <p className="text-xs text-text-light">
              Share custom nodes as a file: export some as a pack, import packs
              from a file, a URL or the community index.
              {isDemoMode
                ? " In the demo, packs install into this browser."
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-text-light hover:bg-accent hover:text-text"
            aria-label="Close node packs"
          >
            <DynamicIcon name="X" className="h-5 w-5" />
          </button>
        </div>
        <div
          role="tablist"
          aria-label="Node pack sections"
          className="flex gap-2 border-b border-accent px-4 py-2"
        >
          {(
            [
              ["installed", "Installed"],
              ["import", "Import"],
              ["export", "Export"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={section === id}
              onClick={() => setSection(id)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                section === id
                  ? "bg-nextflow-green text-white"
                  : "text-text-light hover:bg-accent hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loadError && (
            <p role="alert" className="mb-3 text-sm text-red-400">
              Custom nodes couldn't be loaded: {loadError}
            </p>
          )}
          {section === "installed" && (
            <InstalledPacks customNodes={customNodes} onChanged={changed} />
          )}
          {section === "import" && (
            <ImportPack customNodes={customNodes} onChanged={changed} />
          )}
          {section === "export" && <ExportPack customNodes={customNodes} />}
        </div>
      </dialog>
    </div>
  );
};

const InstalledPacks: React.FC<{
  customNodes: StoredCustomNode[];
  onChanged: () => Promise<void>;
}> = ({ customNodes, onChanged }) => {
  const packs = useMemo(() => groupInstalledPacks(customNodes), [customNodes]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localCount = customNodes.filter((node) => !node.pack).length;

  const remove = async (pack: InstalledNodePack) => {
    setBusy(true);
    setError(null);
    try {
      await removeNodePack(pack);
      setConfirming(null);
      await onChanged();
    } catch (removeError) {
      setError(getErrorMessage(removeError, "The pack couldn't be removed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {packs.length === 0 && (
        <p className="text-sm text-text-light">
          No packs installed. Import one in the Import tab.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <ul aria-label="Installed packs" className="space-y-2">
        {packs.map((pack) => (
          <li
            key={pack.id}
            className="rounded-md border border-accent p-3"
            aria-label={`${pack.name} ${pack.version}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-text">
                  {pack.name}{" "}
                  <span className="text-xs text-text-light">
                    {pack.version} · {pack.id}
                  </span>
                </h3>
                <p className="text-xs text-text-light">
                  {pack.nodes.map((node) => node.label).join(", ")}
                </p>
              </div>
              {confirming === pack.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-light">
                    Delete its {pack.nodes.length} node
                    {pack.nodes.length === 1 ? "" : "s"}? Saved workflows lose
                    them.
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(pack)}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded-md px-3 py-1.5 text-sm text-text-light hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(pack.id)}
                  className="rounded-md border border-accent px-3 py-1.5 text-sm text-text hover:bg-accent"
                  aria-label={`Remove ${pack.name}`}
                >
                  Remove pack
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {localCount > 0 && (
        <p className="text-xs text-text-light">
          {localCount} custom node{localCount === 1 ? "" : "s"} made here (not
          from a pack). Share them from the Export tab.
        </p>
      )}
    </div>
  );
};

const ImportPack: React.FC<{
  customNodes: StoredCustomNode[];
  onChanged: () => Promise<void>;
}> = ({ customNodes, onChanged }) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedNodePack | null>(null);
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<NodePackImportResult | null>(null);
  const [index, setIndex] = useState<{
    entries: NodePackIndexEntry[];
    error: string | null;
    loaded: boolean;
  }>({ entries: [], error: null, loaded: false });

  const validNodes = useMemo(
    () =>
      (parsed?.nodes ?? []).flatMap((node) => (node.node ? [node.node] : [])),
    [parsed],
  );
  const conflicts = useMemo(
    () => findPackConflicts(validNodes, customNodes),
    [validNodes, customNodes],
  );
  const toSave = useMemo(
    () => resolvePackImport(validNodes, customNodes, choices),
    [validNodes, customNodes, choices],
  );

  const read = (text: string) => {
    const next = parseNodePack(text);
    setParsed(next);
    setChoices({});
    setResult(null);
    setMissing([]);
    const refs = next.nodes.flatMap((node) => (node.node ? [node.nfcore] : []));
    getMissingNfCoreComponents(refs)
      .then(setMissing)
      .catch(() => setMissing([]));
  };

  const load = async (source: () => Promise<string>) => {
    setLoading(true);
    setLoadError(null);
    try {
      read(await source());
    } catch (error) {
      setParsed(null);
      setLoadError(getErrorMessage(error, "unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const loadIndex = async () => {
    try {
      const text = await fetchNodePackText(NODE_PACK_INDEX_URL);
      const { entries, errors } = parseNodePackIndex(text, NODE_PACK_INDEX_URL);
      setIndex({ entries, error: errors[0] ?? null, loaded: true });
    } catch (error) {
      setIndex({
        entries: [],
        error: `The community index isn't reachable (${getErrorMessage(error, "unknown error")}).`,
        loaded: true,
      });
    }
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const imported = await importPackNodes(toSave, missing);
      setResult(imported);
      await onChanged();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm text-text">
          <span className="mb-1 block font-medium">From a file</span>
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Node pack file"
            className="block w-full text-sm text-text-light"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void load(() => file.text());
            }}
          />
        </label>
        <form
          className="text-sm text-text"
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim()) void load(() => fetchNodePackText(url.trim()));
          }}
        >
          <label htmlFor="node-pack-url" className="mb-1 block font-medium">
            From a URL
          </label>
          <div className="flex gap-2">
            <input
              id="node-pack-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://.../my-pack.nwave-pack.json"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="rounded-md border border-accent px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              Load
            </button>
          </div>
        </form>
      </div>

      <details
        className="rounded-md border border-accent p-3 text-sm"
        onToggle={(event) => {
          if ((event.target as HTMLDetailsElement).open && !index.loaded) {
            void loadIndex();
          }
        }}
      >
        <summary className="cursor-pointer font-medium text-text">
          Community packs
        </summary>
        <p className="mt-2 text-xs text-text-light">
          Packs listed in the community index ({NODE_PACK_INDEX_URL}).
        </p>
        {!index.loaded && <p className="mt-2 text-text-light">Loading...</p>}
        {index.error && (
          <p className="mt-2 text-xs text-yellow-500">{index.error}</p>
        )}
        <ul aria-label="Community packs" className="mt-2 space-y-2">
          {index.entries.map((entry) => (
            <li
              key={entry.url}
              className="flex items-center justify-between gap-2"
            >
              <div>
                <p className="font-medium text-text">
                  {entry.name}{" "}
                  <span className="text-xs text-text-light">
                    {entry.version}
                    {entry.author ? ` · ${entry.author}` : ""}
                  </span>
                </p>
                {entry.description && (
                  <p className="text-xs text-text-light">{entry.description}</p>
                )}
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(() => fetchNodePackText(entry.url))}
                className="rounded-md border border-accent px-3 py-1.5 hover:bg-accent disabled:opacity-50"
              >
                Load
              </button>
            </li>
          ))}
        </ul>
      </details>

      {loading && <p className="text-sm text-text-light">Loading pack...</p>}
      {loadError && (
        <p role="alert" className="text-sm text-red-400">
          {loadError}
        </p>
      )}

      {parsed && parsed.errors.length > 0 && (
        <div role="alert" className="rounded-md border border-red-500/60 p-3">
          <p className="text-sm font-medium text-red-400">
            This pack can't be imported:
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-300">
            {parsed.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {parsed?.pack && (
        <section aria-label="Pack preview" className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-text">
              {parsed.pack.name}{" "}
              <span className="text-xs font-normal text-text-light">
                {parsed.pack.version} · {parsed.pack.id}
                {parsed.pack.author ? ` · ${parsed.pack.author}` : ""}
              </span>
            </h3>
            {parsed.pack.description && (
              <p className="text-xs text-text-light">
                {parsed.pack.description}
              </p>
            )}
          </div>
          <ul aria-label="Pack nodes" className="space-y-2">
            {parsed.nodes.map((node) => {
              const conflict = conflicts.find(
                (candidate) => candidate.incoming.id === node.id,
              );
              return (
                <li
                  key={node.id}
                  aria-label={node.label}
                  className="rounded-md border border-accent p-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <DynamicIcon
                      name={node.errors.length > 0 ? "CircleX" : "CircleCheck"}
                      className={`h-4 w-4 ${node.errors.length > 0 ? "text-red-400" : "text-nextflow-green"}`}
                    />
                    <span className="font-medium text-text">{node.label}</span>
                    <span className="text-xs text-text-light">{node.id}</span>
                  </div>
                  {node.errors.length > 0 && (
                    <ul className="mt-1 list-disc pl-6 text-xs text-red-300">
                      {node.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  )}
                  {node.warnings.length > 0 && (
                    <ul className="mt-1 list-disc pl-6 text-xs text-yellow-500">
                      {node.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {conflict && (
                    <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-light">
                      {conflict.existingSource === "same-pack"
                        ? `Already installed from this pack (${conflict.existing.pack?.version}).`
                        : conflict.existingSource === "other-pack"
                          ? `The id is used by "${conflict.existing.label}" from ${conflict.existing.pack?.name}.`
                          : `The id is used by your custom node "${conflict.existing.label}".`}
                      <select
                        aria-label={`When ${node.label} is already installed`}
                        value={
                          choices[node.id] ?? defaultConflictChoice(conflict)
                        }
                        onChange={(event) =>
                          setChoices((previous) => ({
                            ...previous,
                            [node.id]: event.target.value as ConflictChoice,
                          }))
                        }
                        className="rounded-md border border-accent bg-background px-2 py-1 text-text"
                      >
                        <option value="replace">Replace it</option>
                        <option value="keep-both">Keep both (rename)</option>
                        <option value="skip">Skip this node</option>
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          {missing.length > 0 && (
            <p className="text-xs text-text-light">
              Also installs the nf-core components these nodes include:{" "}
              {missing.join(", ")}.
            </p>
          )}
          {validNodes.length < parsed.nodes.length && (
            <p className="text-xs text-yellow-500">
              Nodes with errors are skipped.
            </p>
          )}
          <button
            type="button"
            disabled={importing || toSave.length === 0 || result !== null}
            onClick={() => void runImport()}
            className="rounded-md bg-nextflow-green px-4 py-2 text-sm font-medium text-white hover:bg-nextflow-green-dark disabled:opacity-50"
          >
            {importing
              ? "Importing..."
              : `Import ${toSave.length} node${toSave.length === 1 ? "" : "s"}`}
          </button>
          {result && (
            <output className="block text-sm">
              <p className="text-nextflow-green">
                Imported {result.saved.length} node
                {result.saved.length === 1 ? "" : "s"}
                {result.installedComponents.length > 0
                  ? ` and installed ${result.installedComponents.length} nf-core component${result.installedComponents.length === 1 ? "" : "s"}`
                  : ""}
                . They're in the Add node menu under "Pack: {parsed.pack.name}".
              </p>
              {result.failures.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-red-300">
                  {result.failures.map((failure) => (
                    <li key={failure}>{failure}</li>
                  ))}
                </ul>
              )}
            </output>
          )}
        </section>
      )}
    </div>
  );
};

const ExportPack: React.FC<{ customNodes: StoredCustomNode[] }> = ({
  customNodes,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [problems, setProblems] = useState<string[]>([]);

  if (customNodes.length === 0) {
    return (
      <p className="text-sm text-text-light">
        No custom nodes yet. Create one (Add node → Custom process) or convert a
        node from its Code tab, then export it here.
      </p>
    );
  }

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportPack = () => {
    const nodes = customNodes.filter((node) => selected.has(node.id));
    const pack = buildNodePack(
      {
        name,
        version,
        description,
        author,
        createdWith: `N-WAVE ${appVersion()}`,
      },
      nodes,
    );
    const text = serializeNodePack(pack);
    // Check the pack the way an import will.
    const check = parseNodePack(text);
    const issues = [
      ...check.errors,
      ...check.nodes.flatMap((node) =>
        node.errors.map((error) => `${node.label}: ${error}`),
      ),
    ];
    setProblems(issues);
    if (issues.length > 0) return;
    downloadText(text, nodePackFileName(pack));
  };

  const ready =
    name.trim() !== "" && version.trim() !== "" && selected.size > 0;

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-text">
          Nodes to include
        </legend>
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-accent p-2">
          {customNodes.map((node) => (
            <li key={node.id}>
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  checked={selected.has(node.id)}
                  onChange={() => toggle(node.id)}
                />
                <DynamicIcon name={node.icon} className="h-4 w-4" />
                {node.label}
                <span className="text-xs text-text-light">
                  {node.pack ? `from ${node.pack.name}` : node.id}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-text">
          <span className="mb-1 block font-medium">Pack name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="RNA-seq extras"
            className={inputClass}
          />
        </label>
        <label className="text-sm text-text">
          <span className="mb-1 block font-medium">Version</span>
          <input
            value={version}
            onChange={(event) => setVersion(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-sm text-text">
          <span className="mb-1 block font-medium">Description</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-sm text-text">
          <span className="mb-1 block font-medium">Author</span>
          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {problems.length > 0 && (
        <div role="alert" className="text-sm text-red-400">
          <p>The pack wouldn't import cleanly:</p>
          <ul className="list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={exportPack}
        className="rounded-md bg-nextflow-green px-4 py-2 text-sm font-medium text-white hover:bg-nextflow-green-dark disabled:opacity-50"
      >
        Download pack
      </button>
    </div>
  );
};

export default NodePacksModal;
