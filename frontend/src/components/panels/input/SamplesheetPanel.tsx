import type React from "react";
import { type ChangeEvent, useEffect, useId, useMemo, useRef } from "react";
import type { Node } from "reactflow";
import { useWorkflowContext } from "../../../context/WorkflowContext";
import {
  DEFAULT_SAMPLESHEET_MAPPING,
  getSamplesheetFileName,
  getSamplesheetMapping,
  isRemoteOrAbsolutePath,
  type ParsedSamplesheet,
  parseSamplesheet,
  RNASEQ_SAMPLESHEET_TEMPLATE,
  type SamplesheetMapping,
} from "../../../registry/samplesheet";
import { getNodeInputFiles } from "../../../utils/inputFiles";
import type { NodeData } from "../../nodes/BaseNode";

interface SamplesheetPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const fieldClassName =
  "w-full rounded-md border border-accent bg-background p-2 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

/** One-line summary for the node: sample count, read layout, errors. */
export const summarizeSamplesheet = (parsed: ParsedSamplesheet): string => {
  const errors = parsed.issues.filter((issue) => issue.level === "error");
  if (errors.length > 0) {
    return `${errors.length} problem${errors.length === 1 ? "" : "s"} to fix`;
  }
  if (parsed.rows.length === 0) return "No samples yet";
  const paired = parsed.rows.filter((row) => !row.singleEnd).length;
  const layout =
    paired === parsed.rows.length
      ? "paired-end"
      : paired === 0
        ? "single-end"
        : `${paired} paired-end`;
  return `${parsed.rows.length} sample${parsed.rows.length === 1 ? "" : "s"}, ${layout}`;
};

/** Edit an nf-core-style samplesheet and preview the samples it produces. */
const SamplesheetPanel: React.FC<SamplesheetPanelProps> = ({
  node,
  onSave,
}) => {
  const fieldId = useId();
  const uploadRef = useRef<HTMLInputElement>(null);
  const { nodes } = useWorkflowContext();
  const text =
    typeof node.data.samplesheet === "string" ? node.data.samplesheet : "";
  const fileName = getSamplesheetFileName(node.data);
  const mapping = getSamplesheetMapping(node.data);

  // Files uploaded to File Input nodes, which relative paths can refer to.
  const availableFiles = useMemo(
    () =>
      nodes
        .filter((candidate) => candidate.type === "fileInput")
        .flatMap((candidate) => getNodeInputFiles(candidate))
        .map((file) => file.name),
    [nodes],
  );
  const parsed = useMemo(
    () => parseSamplesheet(text, mapping, availableFiles),
    [text, mapping, availableFiles],
  );
  const summary = summarizeSamplesheet(parsed);

  useEffect(() => {
    if (node.data.subtitle !== summary) {
      onSave(node.id, { subtitle: summary });
    }
  }, [node.id, node.data.subtitle, onSave, summary]);

  const setMapping = (change: Partial<SamplesheetMapping>) =>
    onSave(node.id, { samplesheetMapping: { ...mapping, ...change } });

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    file.text().then((content) => {
      onSave(node.id, {
        samplesheet: content,
        samplesheetFileName: /^[A-Za-z0-9._-]+$/.test(file.name)
          ? file.name
          : fileName,
      });
    });
  };

  const metaColumns = parsed.columns.filter(
    (column) =>
      column !== mapping.idColumn &&
      column !== mapping.read1Column &&
      column !== mapping.read2Column,
  );
  const errors = parsed.issues.filter((issue) => issue.level === "error");
  const warnings = parsed.issues.filter((issue) => issue.level === "warning");

  const columnSelect = (
    key: keyof SamplesheetMapping,
    label: string,
    optional = false,
  ) => {
    const options = Array.from(
      new Set([...parsed.columns, mapping[key]].filter(Boolean)),
    );
    return (
      <div className="min-w-[120px] flex-1">
        <label
          htmlFor={`${fieldId}-${key}`}
          className="mb-1 block text-xs font-medium text-text-light"
        >
          {label}
        </label>
        <select
          id={`${fieldId}-${key}`}
          value={mapping[key]}
          onChange={(event) => setMapping({ [key]: event.target.value })}
          className={fieldClassName}
        >
          {optional && <option value="">None (single-end)</option>}
          {options.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-light">
        One row per sample, as in nf-core pipelines. Each row becomes{" "}
        <code>[ meta, [ reads ] ]</code> with <code>meta.id</code>,{" "}
        <code>meta.single_end</code> and the other columns. Read paths are names
        of files uploaded to a File Input node, or absolute paths and URLs for
        local runs.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <label
            htmlFor={`${fieldId}-file-name`}
            className="mb-1 block text-xs font-medium text-text-light"
          >
            File name in inputs/
          </label>
          <input
            id={`${fieldId}-file-name`}
            value={node.data.samplesheetFileName ?? fileName}
            onChange={(event) =>
              onSave(node.id, { samplesheetFileName: event.target.value })
            }
            className={`${fieldClassName} font-mono`}
          />
        </div>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent"
        >
          Load CSV
        </button>
        <button
          type="button"
          onClick={() =>
            onSave(node.id, {
              samplesheet: RNASEQ_SAMPLESHEET_TEMPLATE,
              samplesheetMapping: DEFAULT_SAMPLESHEET_MAPPING,
            })
          }
          className="rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent"
        >
          rnaseq template
        </button>
        <input
          ref={uploadRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleUpload}
          className="hidden"
          aria-label="Samplesheet CSV file"
        />
      </div>

      <div>
        <label
          htmlFor={`${fieldId}-csv`}
          className="mb-1 block text-xs font-medium text-text-light"
        >
          Samplesheet (CSV)
        </label>
        <textarea
          id={`${fieldId}-csv`}
          value={text}
          onChange={(event) =>
            onSave(node.id, { samplesheet: event.target.value })
          }
          rows={8}
          spellCheck={false}
          className={`${fieldClassName} font-mono text-xs`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {columnSelect("idColumn", "Sample id column")}
        {columnSelect("read1Column", "Read 1 column")}
        {columnSelect("read2Column", "Read 2 column", true)}
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="space-y-1 text-sm" aria-label="Samplesheet problems">
          {[...errors, ...warnings].map((issue) => (
            <li
              key={`${issue.level}-${issue.line ?? 0}-${issue.message}`}
              className={
                issue.level === "error" ? "text-danger" : "text-yellow-200"
              }
            >
              {issue.level === "error" ? "Error: " : "Warning: "}
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {parsed.rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-panel-border">
          <table
            className="w-full text-left text-xs"
            aria-label="Parsed samples"
          >
            <thead className="bg-accent/40 text-text-light">
              <tr>
                <th className="px-2 py-1 font-medium">meta.id</th>
                <th className="px-2 py-1 font-medium">Reads</th>
                <th className="px-2 py-1 font-medium">Layout</th>
                {metaColumns.map((column) => (
                  <th key={column} className="px-2 py-1 font-medium">
                    meta.{column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.map((row) => (
                <tr key={row.line} className="border-t border-panel-border">
                  <td className="px-2 py-1 font-mono">{row.id}</td>
                  <td className="px-2 py-1 font-mono">
                    {row.reads.map((read) => (
                      <div key={read}>
                        {read}
                        {isRemoteOrAbsolutePath(read) && (
                          <span className="ml-1 text-text-light">
                            (local runs)
                          </span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="px-2 py-1">
                    {row.singleEnd ? "single-end" : "paired-end"}
                  </td>
                  {metaColumns.map((column) => (
                    <td key={column} className="px-2 py-1 font-mono">
                      {row.meta[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SamplesheetPanel;
