import type React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import type { Node } from "reactflow";
import { getPipelineSchema } from "../../../api/pipelines";
import { useWorkflowContext } from "../../../context/WorkflowContext";
import {
  buildPipelineLaunch,
  getPipelineLaunchIssues,
  KNOWN_PIPELINES,
  PIPELINE_NAME,
  PIPELINE_VERSION,
  pipelineParamsFile,
} from "../../../registry/pipelines/launch";
import {
  coerceParamValue,
  isPathParam,
  type PipelineParam,
  type PipelineParamGroup,
  type PipelineParamValues,
  parsePipelineSchema,
  validatePipelineParams,
} from "../../../registry/pipelines/schema";
import { getApiErrorMessage } from "../../../utils/errors";
import CodeBlock from "../../common/data/CodeBlock";
import type { NodeData, PortData } from "../../nodes/BaseNode";
import PipelineResults from "./PipelineResults";

interface PipelinePanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const fieldClassName =
  "w-full rounded-md border border-accent bg-background p-2 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green";

// Schemas fetched this session, by "name@version".
const schemaCache = new Map<string, Promise<PipelineParamGroup[]>>();

const loadGroups = (name: string, version: string) => {
  const key = `${name}@${version}`;
  let groups = schemaCache.get(key);
  if (!groups) {
    groups = getPipelineSchema(name, version).then(parsePipelineSchema);
    groups.catch(() => schemaCache.delete(key));
    schemaCache.set(key, groups);
  }
  return groups;
};

/** The samplesheet port; other path params become ports on request. */
const INPUT_PORT: PortData = {
  name: "input",
  label: "--input",
  isConnectable: true,
};

/** Settings of a Pipeline node: which pipeline, and its parameters. */
const PipelinePanel: React.FC<PipelinePanelProps> = ({ node, onSave }) => {
  const fieldId = useId();
  const { nodes, edges } = useWorkflowContext();
  const name = String(node.data.pipelineName ?? "");
  const version = String(node.data.pipelineVersion ?? "");
  const values = (node.data.pipelineValues ?? {}) as PipelineParamValues;
  const testProfile = Boolean(node.data.pipelineTestProfile);
  const ports = (node.data.inputs ?? [INPUT_PORT]) as PortData[];
  const [nameText, setNameText] = useState(name);
  const [versionText, setVersionText] = useState(version);
  const [schema, setSchema] = useState<
    | { status: "loading" }
    | { status: "loaded"; groups: PipelineParamGroup[] }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const [filter, setFilter] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (!PIPELINE_NAME.test(name) || !PIPELINE_VERSION.test(version)) {
      setSchema({
        status: "error",
        message: "Enter a pipeline name and version.",
      });
      return;
    }
    let cancelled = false;
    setSchema({ status: "loading" });
    loadGroups(name, version).then(
      (groups) => !cancelled && setSchema({ status: "loaded", groups }),
      (error: unknown) =>
        !cancelled &&
        setSchema({
          status: "error",
          message: getApiErrorMessage(
            error,
            "Could not load the pipeline's parameters.",
          ),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [name, version]);

  const setPipeline = (nextName: string, nextVersion: string) => {
    if (nextName === name && nextVersion === version) return;
    onSave(node.id, {
      pipelineName: nextName,
      pipelineVersion: nextVersion,
      subtitle: `nf-core/${nextName} ${nextVersion}`,
      // Params differ between pipelines; keep them for a new version only.
      ...(nextName !== name
        ? { pipelineValues: {}, inputs: [INPUT_PORT] }
        : {}),
    });
  };

  const setValue = (param: PipelineParam, raw: string | boolean) => {
    const next = { ...values };
    const value = coerceParamValue(param, raw);
    if (value === undefined || value === param.default) delete next[param.name];
    // Text stays as typed; numbers that don't parse stay text, so the
    // validation can flag them.
    else next[param.name] = param.type === "string" ? String(raw) : value;
    onSave(node.id, { pipelineValues: next });
  };

  const togglePort = (param: PipelineParam, connect: boolean) => {
    const nextPorts = connect
      ? [
          ...ports,
          { name: param.name, label: `--${param.name}`, isConnectable: true },
        ]
      : ports.filter((port) => port.name !== param.name);
    onSave(node.id, { inputs: nextPorts });
  };

  const connected = useMemo(
    () =>
      new Set(
        edges
          .filter((edge) => edge.target === node.id && edge.targetHandle)
          .map((edge) => edge.targetHandle as string),
      ),
    [edges, node.id],
  );
  const issues = [
    ...getPipelineLaunchIssues(nodes, edges),
    ...(schema.status === "loaded"
      ? validatePipelineParams(schema.groups, values, {
          provided: new Set(["outdir", ...connected]),
          testProfile,
        }).map((issue) => issue.message)
      : []),
  ];
  const launch = useMemo(() => {
    try {
      return buildPipelineLaunch(nodes, edges);
    } catch {
      return null;
    }
  }, [nodes, edges]);

  const search = filter.trim().toLowerCase();
  // N-WAVE sets --outdir (results/ of the run) itself.
  const visible = (param: PipelineParam) =>
    param.name !== "outdir" &&
    (showHidden || !param.hidden || values[param.name] !== undefined) &&
    (!search ||
      param.name.toLowerCase().includes(search) ||
      param.description.toLowerCase().includes(search));

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-light">
        Runs a complete nf-core pipeline with Docker. Connect a Samplesheet node
        to its input and set parameters below; the settings come from the
        pipeline&apos;s <code>nextflow_schema.json</code>.
      </p>

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
              list={`${fieldId}-pipelines`}
              value={nameText}
              onChange={(event) => setNameText(event.target.value.trim())}
              onBlur={() => setPipeline(nameText, versionText)}
              className={`${fieldClassName} font-mono`}
            />
          </div>
          <datalist id={`${fieldId}-pipelines`}>
            {KNOWN_PIPELINES.map((pipeline) => (
              <option key={pipeline.name} value={pipeline.name}>
                {pipeline.description}
              </option>
            ))}
          </datalist>
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
            list={`${fieldId}-versions`}
            value={versionText}
            onChange={(event) => setVersionText(event.target.value.trim())}
            onBlur={() => setPipeline(nameText, versionText)}
            className={`${fieldClassName} font-mono`}
          />
          <datalist id={`${fieldId}-versions`}>
            {(
              KNOWN_PIPELINES.find((pipeline) => pipeline.name === nameText)
                ?.versions ?? []
            ).map((known) => (
              <option key={known} value={known} />
            ))}
          </datalist>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={testProfile}
          onChange={(event) =>
            onSave(node.id, { pipelineTestProfile: event.target.checked })
          }
          className="rounded border-accent"
        />
        Use the pipeline&apos;s test profile (small test data, no inputs needed)
      </label>

      {issues.length > 0 && (
        <ul
          aria-label="Pipeline problems"
          className="space-y-1 text-sm text-danger"
        >
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      {schema.status === "loading" && (
        <p className="text-sm text-text-light">
          Loading the pipeline&apos;s parameters…
        </p>
      )}
      {schema.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {schema.message}
        </p>
      )}

      {schema.status === "loaded" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              aria-label="Filter parameters"
              placeholder="Filter parameters…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className={`${fieldClassName} max-w-xs`}
            />
            <label className="flex items-center gap-1 text-xs text-text-light">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(event) => setShowHidden(event.target.checked)}
                className="rounded border-accent"
              />
              Show hidden parameters
            </label>
          </div>
          {schema.groups.map((group, index) => {
            const params = group.params.filter(visible);
            if (params.length === 0) return null;
            return (
              <details
                key={group.id}
                open={index === 0 || Boolean(search)}
                className="rounded-md border border-accent p-2"
              >
                <summary className="cursor-pointer text-sm font-semibold text-text">
                  {group.title}
                </summary>
                {group.description && (
                  <p className="mt-1 text-xs text-text-light">
                    {group.description}
                  </p>
                )}
                <div className="mt-2 space-y-3">
                  {params.map((param) => (
                    <ParamField
                      key={param.name}
                      id={`${fieldId}-${param.name}`}
                      param={param}
                      value={values[param.name]}
                      onChange={(value) => setValue(param, value)}
                      port={ports.some((port) => port.name === param.name)}
                      connected={connected.has(param.name)}
                      onTogglePort={
                        isPathParam(param) &&
                        param.name !== "input" &&
                        param.name !== "outdir"
                          ? (connect) => togglePort(param, connect)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {launch && (
        <div className="space-y-2 border-t border-accent pt-4">
          <h4 className="text-sm font-semibold text-text">Launch</h4>
          <CodeBlock code={launch.command} label="Launch command" />
          {Object.keys(launch.params).length > 0 && (
            <CodeBlock code={pipelineParamsFile(launch)} label="Params file" />
          )}
        </div>
      )}

      <PipelineResults node={node} />
    </div>
  );
};

const ParamField: React.FC<{
  id: string;
  param: PipelineParam;
  value: string | number | boolean | undefined;
  onChange: (value: string | boolean) => void;
  port: boolean;
  connected: boolean;
  onTogglePort?: (connect: boolean) => void;
}> = ({ id, param, value, onChange, port, connected, onTogglePort }) => {
  const label = (
    <span className="font-mono">
      --{param.name}
      {param.required && <span className="text-danger"> *</span>}
    </span>
  );
  const description = (
    <>
      {param.description && (
        <p id={`${id}-description`} className="text-xs text-text-light">
          {param.description}
        </p>
      )}
      {param.helpText && (
        <details className="text-xs text-text-light">
          <summary className="cursor-pointer">More</summary>
          <p className="mt-1 whitespace-pre-line">{param.helpText}</p>
        </details>
      )}
    </>
  );

  if (param.type === "boolean") {
    const checked =
      value === undefined
        ? param.default === true
        : value === true || value === "true";
    return (
      <div className="space-y-1">
        <label
          htmlFor={id}
          className="flex items-center gap-2 text-sm text-text"
        >
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby={`${id}-description`}
            className="rounded border-accent"
          />
          {label}
        </label>
        {description}
      </div>
    );
  }

  const current = value === undefined ? "" : String(value);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-text">
        {label}
        {connected && (
          <span className="ml-2 text-xs text-nextflow-green">connected</span>
        )}
      </label>
      {param.enum ? (
        <select
          id={id}
          value={current}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-description`}
          className={fieldClassName}
        >
          <option value="">
            {param.default !== undefined
              ? `Default (${param.default})`
              : "Not set"}
          </option>
          {param.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={param.type === "string" ? "text" : "number"}
          step={param.type === "integer" ? 1 : "any"}
          value={current}
          disabled={connected}
          placeholder={
            param.default !== undefined
              ? `Default: ${param.default}`
              : isPathParam(param)
                ? "Uploaded file name, absolute path or URL"
                : undefined
          }
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-description`}
          className={`${fieldClassName} disabled:opacity-50`}
        />
      )}
      {description}
      {onTogglePort && (
        <label className="flex items-center gap-1 text-xs text-text-light">
          <input
            type="checkbox"
            checked={port}
            onChange={(event) => onTogglePort(event.target.checked)}
            className="rounded border-accent"
          />
          Input port (connect a Parameters or File Input node)
        </label>
      )}
    </div>
  );
};

export default PipelinePanel;
