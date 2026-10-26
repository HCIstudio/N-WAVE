import type React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { listPipelines } from "../../../api/pipelines";
import {
  pipelinePageUrl,
  searchPipelines,
  type PipelineInfo,
} from "../../../registry/pipelines/catalog";
import { getApiErrorMessage } from "../../../utils/errors";

interface PipelinePickerProps {
  name: string;
  version: string;
  onChange: (name: string, version: string) => void;
  fieldClassName: string;
}

/** How many matches the list shows at once. */
const MAX_MATCHES = 50;

// The list is fetched once per session; a failed fetch is tried again.
let catalogRequest: Promise<{ pipelines: PipelineInfo[]; stale?: boolean }> | null =
  null;
const loadCatalog = () => {
  if (!catalogRequest) {
    catalogRequest = listPipelines();
    catalogRequest.catch(() => {
      catalogRequest = null;
    });
  }
  return catalogRequest;
};

/** Forgets the fetched list (tests). */
export const resetPipelineCatalogCache = (): void => {
  catalogRequest = null;
};

type CatalogState =
  | { status: "loading" }
  | { status: "loaded"; pipelines: PipelineInfo[]; stale: boolean }
  | { status: "error"; message: string };

/**
 * Picks an nf-core pipeline and one of its releases from nf-co.re's list,
 * or (when the list can't be loaded) takes them as typed.
 */
const PipelinePicker: React.FC<PipelinePickerProps> = ({
  name,
  version,
  onChange,
  fieldClassName,
}) => {
  const fieldId = useId();
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [query, setQuery] = useState(name);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [versionText, setVersionText] = useState(version);

  useEffect(() => {
    let cancelled = false;
    loadCatalog().then(
      (result) =>
        !cancelled &&
        setCatalog({
          status: "loaded",
          pipelines: result.pipelines,
          stale: Boolean(result.stale),
        }),
      (error: unknown) =>
        !cancelled &&
        setCatalog({
          status: "error",
          message: getApiErrorMessage(error, "nf-co.re could not be reached."),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Another tab, undo or a load changes the node.
  useEffect(() => {
    if (!open) setQuery(name);
  }, [name, open]);
  useEffect(() => setVersionText(version), [version]);

  const pipelines = catalog.status === "loaded" ? catalog.pipelines : [];
  const selected = pipelines.find((pipeline) => pipeline.name === name);
  const matches = useMemo(
    // While the list is closed (or nothing typed yet) every pipeline shows.
    () => searchPipelines(pipelines, query === name ? "" : query).slice(0, MAX_MATCHES),
    [pipelines, query, name],
  );

  const choose = (pipeline: PipelineInfo) => {
    setOpen(false);
    setQuery(pipeline.name);
    const nextVersion =
      pipeline.name === name ? version : (pipeline.versions[0] ?? "dev");
    onChange(pipeline.name, nextVersion);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) =>
        matches.length === 0 ? 0 : (index + step + matches.length) % matches.length,
      );
    } else if (event.key === "Enter" && open && matches[active]) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery(name);
    }
  };

  const pageLink = (
    <a
      href={pipelinePageUrl(name)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-nextflow-green hover:underline"
    >
      {name ? `nf-core/${name} on nf-co.re` : "nf-co.re/pipelines"}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );

  if (catalog.status !== "loaded") {
    // Without the list: typed in, with a hint where to look them up.
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[140px] flex-1">
            <label
              htmlFor={`${fieldId}-name`}
              className="mb-1 block text-xs font-medium text-text-light"
            >
              Pipeline
            </label>
            <div className="flex items-center gap-1">
              <span className="whitespace-nowrap text-sm text-text-light">
                nf-core/
              </span>
              <input
                id={`${fieldId}-name`}
                value={query}
                onChange={(event) => setQuery(event.target.value.trim())}
                onBlur={() => onChange(query, versionText)}
                className={`${fieldClassName} font-mono`}
              />
            </div>
          </div>
          <div className="min-w-[100px] flex-1">
            <label
              htmlFor={`${fieldId}-version`}
              className="mb-1 block text-xs font-medium text-text-light"
            >
              Version
            </label>
            <input
              id={`${fieldId}-version`}
              value={versionText}
              onChange={(event) => setVersionText(event.target.value.trim())}
              onBlur={() => onChange(query, versionText)}
              className={`${fieldClassName} font-mono`}
            />
          </div>
        </div>
        <p className="text-xs text-text-light">
          {catalog.status === "loading"
            ? "Loading the list of nf-core pipelines…"
            : `The list of nf-core pipelines couldn't be loaded (${catalog.message}).`}{" "}
          The name is the part after <code>nf-core/</code> on{" "}
          <a
            href={pipelinePageUrl("")}
            target="_blank"
            rel="noreferrer"
            className="text-nextflow-green hover:underline"
          >
            nf-co.re/pipelines
          </a>{" "}
          (e.g. <code>rnaseq</code>). The version is a release number shown at
          the top of the pipeline&apos;s page (e.g. <code>3.27.0</code>), or{" "}
          <code>dev</code> for the latest code.
        </p>
      </div>
    );
  }

  const versions = selected?.versions ?? [];
  const versionOptions = [
    ...versions,
    ...(version && version !== "dev" && !versions.includes(version) ? [version] : []),
    "dev",
  ];
  const listId = `${fieldId}-pipelines`;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[160px] flex-[2]">
          <label
            htmlFor={`${fieldId}-name`}
            className="mb-1 block text-xs font-medium text-text-light"
          >
            Pipeline
          </label>
          <div className="flex items-center gap-1">
            <span className="whitespace-nowrap text-sm text-text-light">
              nf-core/
            </span>
            <input
              id={`${fieldId}-name`}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                open && matches[active] ? `${listId}-${matches[active].name}` : undefined
              }
              autoComplete="off"
              placeholder="Search pipelines…"
              value={query}
              onFocus={(event) => {
                setOpen(true);
                event.target.select();
              }}
              onChange={(event) => {
                setQuery(event.target.value.trim().toLowerCase());
                setActive(0);
                setOpen(true);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => {
                setOpen(false);
                const typed = pipelines.find((pipeline) => pipeline.name === query);
                if (typed) choose(typed);
                else setQuery(name);
              }}
              className={`${fieldClassName} font-mono`}
            />
          </div>
          {open && (
            <div
              id={listId}
              role="listbox"
              aria-label="nf-core pipelines"
              className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-accent bg-background py-1 text-sm shadow-lg"
            >
              {matches.length === 0 && (
                <p className="px-2 py-1.5 text-text-light">
                  No nf-core pipeline matches “{query}”.
                </p>
              )}
              {matches.map((pipeline, index) => (
                <div
                  key={pipeline.name}
                  id={`${listId}-${pipeline.name}`}
                  role="option"
                  // Focus stays in the search field (aria-activedescendant).
                  tabIndex={-1}
                  aria-selected={index === active}
                  // Before the input's blur, which would close the list.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(pipeline);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={`cursor-pointer px-2 py-1.5 ${
                    index === active ? "bg-accent" : ""
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-text">{pipeline.name}</span>
                    <span className="shrink-0 text-xs text-text-light">
                      {pipeline.archived
                        ? "archived"
                        : (pipeline.versions[0] ?? "no release yet")}
                    </span>
                  </span>
                  {pipeline.description && (
                    <span className="block truncate text-xs text-text-light">
                      {pipeline.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-[110px] flex-1">
          <label
            htmlFor={`${fieldId}-version`}
            className="mb-1 block text-xs font-medium text-text-light"
          >
            Version
          </label>
          <select
            id={`${fieldId}-version`}
            value={version}
            onChange={(event) => onChange(name, event.target.value)}
            className={`${fieldClassName} font-mono`}
          >
            {!version && <option value="">Pick a version</option>}
            {versionOptions.map((option, index) => (
              <option key={option} value={option}>
                {option === "dev"
                  ? "dev (latest code)"
                  : index === 0 && versions[0] === option
                    ? `${option} (latest)`
                    : option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-text-light">
        {selected?.description && (
          <span className="block">{selected.description}</span>
        )}
        {selected?.archived && <>This pipeline is archived. </>}
        {catalog.stale && <>nf-co.re can&apos;t be reached: this list may be out of date. </>}
        Docs, inputs and outputs: {pageLink}
      </p>
    </div>
  );
};

export default PipelinePicker;
