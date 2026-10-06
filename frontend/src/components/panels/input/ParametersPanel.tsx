import type React from "react";
import { useEffect, useId, useMemo } from "react";
import type { Node } from "reactflow";
import { useWorkflowContext } from "../../../context/WorkflowContext";
import {
  getNodeParameters,
  getParameterPorts,
  validateParameters,
  type WorkflowParameter,
  type WorkflowParameterType,
} from "../../../registry/params";
import { getNodeInputFiles } from "../../../utils/inputFiles";
import type { NodeData } from "../../nodes/BaseNode";
import DynamicIcon from "../../common/ui/DynamicIcon";

interface ParametersPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const fieldClassName =
  "w-full rounded-md border border-accent bg-background p-2 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

const typeLabels: Record<WorkflowParameterType, string> = {
  text: "Text",
  number: "Number",
  boolean: "True/false",
  file: "Reference file",
};

/** One-line summary for the node: parameter and reference counts. */
export const summarizeParameters = (
  parameters: WorkflowParameter[],
): string => {
  const references = parameters.filter(
    (parameter) => parameter.type === "file",
  ).length;
  const values = parameters.length - references;
  if (parameters.length === 0) return "No parameters yet";
  return [
    values > 0 ? `${values} parameter${values === 1 ? "" : "s"}` : "",
    references > 0
      ? `${references} reference${references === 1 ? "" : "s"}`
      : "",
  ]
    .filter(Boolean)
    .join(", ");
};

/** Declare workflow parameters and reference files (params.*). */
const ParametersPanel: React.FC<ParametersPanelProps> = ({ node, onSave }) => {
  const fieldId = useId();
  const { nodes, setEdges } = useWorkflowContext();
  const parameters = getNodeParameters(node.data);

  const uploadedFiles = useMemo(
    () =>
      nodes
        .filter((candidate) => candidate.type === "fileInput")
        .flatMap((candidate) => getNodeInputFiles(candidate))
        .map((file) => file.name),
    [nodes],
  );
  const otherNames = useMemo(
    () =>
      nodes
        .filter(
          (candidate) =>
            candidate.type === "parameters" && candidate.id !== node.id,
        )
        .flatMap((candidate) => getNodeParameters(candidate.data))
        .map((parameter) => parameter.name),
    [nodes, node.id],
  );
  const issues = validateParameters(parameters, otherNames, uploadedFiles);
  const summary = summarizeParameters(parameters);

  useEffect(() => {
    if (node.data.subtitle !== summary) onSave(node.id, { subtitle: summary });
  }, [node.id, node.data.subtitle, onSave, summary]);

  const save = (next: WorkflowParameter[]) => {
    const outputs = getParameterPorts(next);
    onSave(node.id, { parameters: next, outputs });
    // Drop connections from references that were removed or renamed.
    const ports = new Set(outputs.map((port) => port.name));
    setEdges((edges) =>
      edges.filter(
        (edge) => edge.source !== node.id || ports.has(edge.sourceHandle ?? ""),
      ),
    );
  };

  const update = (index: number, change: Partial<WorkflowParameter>) =>
    save(
      parameters.map((parameter, current) =>
        current === index ? { ...parameter, ...change } : parameter,
      ),
    );

  const add = (type: WorkflowParameterType) => {
    const base = type === "file" ? "reference" : "param";
    let suffix = 1;
    const names = new Set([
      ...parameters.map((parameter) => parameter.name),
      ...otherNames,
    ]);
    while (names.has(`${base}_${suffix}`)) suffix += 1;
    save([
      ...parameters,
      {
        name: `${base}_${suffix}`,
        type,
        value: type === "boolean" ? "false" : type === "number" ? "0" : "",
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-light">
        Parameters become <code>params.&lt;name&gt;</code> in the script and in
        the exported <code>nextflow.config</code>. Use them in node settings as{" "}
        <code>{"${params.name}"}</code>. Reference files (genome FASTA, GTF,
        indexes) get an output to connect: an uploaded file name, an absolute
        path, or a URL.
      </p>

      <datalist id={`${fieldId}-uploaded`}>
        {uploadedFiles.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {parameters.length > 0 && (
        <ul className="space-y-3" aria-label="Parameters">
          {parameters.map((parameter, index) => {
            const id = `${fieldId}-${index}`;
            const parameterIssues = issues.filter(
              (issue) => issue.name === parameter.name,
            );
            return (
              <li
                // Rows are edited in place; the index is their identity.
                // biome-ignore lint/suspicious/noArrayIndexKey: see comment above.
                key={index}
                className="space-y-2 rounded-md border border-accent p-3"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[140px] flex-1">
                    <label
                      htmlFor={`${id}-name`}
                      className="mb-1 block text-xs text-text-light"
                    >
                      Name
                    </label>
                    <input
                      id={`${id}-name`}
                      value={parameter.name}
                      onChange={(event) =>
                        update(index, { name: event.target.value })
                      }
                      className={`${fieldClassName} font-mono`}
                    />
                  </div>
                  <div className="min-w-[130px]">
                    <label
                      htmlFor={`${id}-type`}
                      className="mb-1 block text-xs text-text-light"
                    >
                      Type
                    </label>
                    <select
                      id={`${id}-type`}
                      value={parameter.type}
                      onChange={(event) =>
                        update(index, {
                          type: event.target.value as WorkflowParameterType,
                          value: "",
                        })
                      }
                      className={fieldClassName}
                    >
                      {Object.entries(typeLabels).map(([type, label]) => (
                        <option key={type} value={type}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      save(parameters.filter((_, current) => current !== index))
                    }
                    className="rounded-md p-2 text-text-light hover:bg-accent hover:text-red-400"
                    aria-label={`Remove ${parameter.name}`}
                  >
                    <DynamicIcon name="Trash2" className="h-4 w-4" />
                  </button>
                </div>

                {parameter.type === "boolean" ? (
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={String(parameter.value) === "true"}
                      onChange={(event) =>
                        update(index, { value: String(event.target.checked) })
                      }
                      className="rounded border-accent"
                    />
                    <span>Value of {parameter.name}</span>
                  </label>
                ) : (
                  <div>
                    <label
                      htmlFor={`${id}-value`}
                      className="mb-1 block text-xs text-text-light"
                    >
                      {parameter.type === "file"
                        ? "File, path or URL"
                        : "Value"}
                    </label>
                    <input
                      id={`${id}-value`}
                      type={parameter.type === "number" ? "number" : "text"}
                      step="any"
                      list={
                        parameter.type === "file"
                          ? `${fieldId}-uploaded`
                          : undefined
                      }
                      value={parameter.value}
                      onChange={(event) =>
                        update(index, { value: event.target.value })
                      }
                      placeholder={
                        parameter.type === "file"
                          ? "genome.fa, /data/genome.fa or https://..."
                          : undefined
                      }
                      className={`${fieldClassName} font-mono`}
                    />
                  </div>
                )}

                {parameterIssues.map((issue) => (
                  <p
                    key={issue.message}
                    className={
                      issue.level === "error"
                        ? "text-sm text-danger"
                        : "text-sm text-yellow-200"
                    }
                  >
                    {issue.level === "error" ? "Error: " : "Warning: "}
                    {issue.message}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => add("text")}
          className="rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent"
        >
          Add parameter
        </button>
        <button
          type="button"
          onClick={() => add("file")}
          className="rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent"
        >
          Add reference file
        </button>
      </div>
    </div>
  );
};

export default ParametersPanel;
