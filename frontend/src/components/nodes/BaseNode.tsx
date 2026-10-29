import {
  Handle,
  Position,
  type Node,
  type NodeProps,
  useConnection,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { memo, type ReactNode, useEffect } from "react";
import { DynamicIcon } from "../common";
import clsx from "clsx";
import { AlertTriangle, XCircle } from "lucide-react";
import { useNodeProblems } from "../../execution/NodeProblemsContext";
import { useNodeRun } from "../../execution/RunTasksContext";
import { NODE_KINDS, nodeKindOf } from "../../workflows/nodeKinds";
import { acceptsManyConnections } from "../../registry/portArity";
import { useFeature } from "../../settings/useFeatures";
import { checkPortFit, portSummary, sourceContents, targetContents } from "../../registry/portTypes";
import type { SelectedFile } from "../../data/types";
import type { FileEncoding } from "../../utils/fileContent";

/** A port's label: one line on node hover, above the others when its port is hovered. */
const PORT_LABEL_CLASS =
  "absolute top-1/2 -translate-y-1/2 whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 group-hover/port:z-20 transition-opacity bg-white px-1 py-px rounded shadow-sm border z-10";
/** What a port takes or gives, shown only while its port is hovered. */
const PORT_DETAIL_CLASS = "hidden text-[10px] leading-tight text-gray-400 group-hover/port:block";

export interface PortData {
  name: string;
  isConnectable?: boolean;
  label?: string; // Display label for the port
  fileType?: string;
  filePattern?: string;
  /** What the port carries, when its module says (nf-core meta.yml). */
  kind?: PortKind;
  /** Inputs: takes any number of connections, mixed (otherwise one). */
  multiple?: boolean;
}

/** Files, a folder (e.g. an index), a value, or a tool's versions. */
export type PortKind = "file" | "directory" | "value" | "version";

export interface FileObject {
  name: string;
  /** Text, or base64 when `encoding` says so (binary files such as .fastq.gz). */
  content: string;
  encoding?: FileEncoding;
  size: number;
  fileType?: string; // Detected file type
  order?: number; // Stable display/merge ordering metadata
  originalName?: string; // Legacy name field in older saved workflows
}

// Define the shape of the node's data
export interface NodeData {
  icon?: string;
  label?: string;
  subtitle?: string;
  note?: string; // Small additional note below subtitle
  status?: "running" | "success" | "error" | "waiting" | "disabled";
  inputs?: PortData[];
  outputs?: PortData[];
  cpuUsage?: number;
  memoryUsage?: number;
  // Custom data properties
  files?: FileObject[];
  selectedFiles?: SelectedFile[];
  selectedFilterFiles?: FileObject[]; // Files selected for filter operations
  fileContent?: string;
  processedContent?: string;
  // Operator-specific properties
  operatorType?: string; // Specifies which operator: 'filter', 'map', 'reduce'
  filterText?: string;
  isHighlight?: boolean;
  _hasWarning?: boolean; // Warning state (e.g., missing file content)
  previewUnavailable?: boolean;
  previewUnavailableReason?: string;
  // Node-type-specific settings (operator options, process parameters,
  // nf-core and custom-node values, ...) are still read and written through
  // this untyped index signature by many panels. Replacing it with per-node
  // data types is a larger refactor; this is the one allowed explicit any.
  // biome-ignore lint/suspicious/noExplicitAny: see comment above.
  [key: string]: any;

  // Process-specific properties
  processInputs?: { type: string; name: string }[];
}

const onMouseDown = (event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const BaseNode = ({
  id,
  data = {},
  type,
  selected,
  isConnectable,
  children,
}: NodeProps<Node<NodeData>> & {
  children?: ReactNode;
}) => {
  // Ports can change at runtime (Parameters references, custom node edits);
  // React Flow has to re-measure the handles to connect to new ones.
  const updateNodeInternals = useUpdateNodeInternals();

  // While a connection is dragged from an output: which inputs here fit it.
  // The selector gives a string, so nodes only re-render when a drag starts
  // or ends, not on every pointer move.
  const dragFrom = useConnection((connection) =>
    connection.inProgress && connection.fromHandle?.type === "source"
      ? `${connection.fromNode.id}\n${connection.fromHandle.id ?? ""}`
      : "",
  );
  const { getNode } = useReactFlow();
  const hintsOn = useFeature("connectionHints");
  const fitOf = (portName: string): { fits: boolean; message?: string } | null => {
    if (!dragFrom || !hintsOn) return null;
    const [fromId, fromHandle = ""] = dragFrom.split("\n");
    const from = fromId === id ? undefined : (getNode(fromId) as Node<NodeData> | undefined);
    if (!from) return null;
    const self = { id, type, position: { x: 0, y: 0 }, data } as Node<NodeData>;
    const hint = checkPortFit(from, fromHandle, self, portName);
    if (hint) return { fits: false, message: hint.message };
    return sourceContents(from, fromHandle) && targetContents(self, portName) ? { fits: true } : null;
  };
  const portKey = [...(data.inputs ?? []), ...(data.outputs ?? [])]
    .map((port) => port.name)
    .join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: portKey is the change signal.
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, portKey, updateNodeInternals]);

  // The last run's state for this node wins over a stored status.
  const { summary: run } = useNodeRun(id);
  // Finished, but past errors Nextflow was told to ignore.
  const ignoredErrors = run?.status === "succeeded" ? run.ignored : 0;
  const status = run
    ? ({ running: "running", succeeded: "success", cached: "success", failed: "error" } as const)[
        run.status
      ]
    : data.status;

  const iconName = data.icon || "DefaultIcon";
  const maxPortCount = Math.max(data.inputs?.length ?? 0, data.outputs?.length ?? 0);
  const dynamicMinHeight = Math.max(100, 56 + maxPortCount * 32);
  const dynamicMinWidth = Math.max(120, maxPortCount > 6 ? 152 : 120);

  // Base classes for the node
  const nodeClasses = [
    "group",
    "min-w-[120px]", // Ensure a minimum width
    "bg-[#fcfcfc]", // Corresponds to --color-node-background, a light grey
    "rounded-lg",
    "flex",
    "flex-col",
    "items-center",
    "justify-center",
    "p-4", // Increased padding for better spacing
    "relative",
    "transition-all",
    "duration-300", // Smoother transitions for status changes
    "ease-in-out",
  ];

  const kind = nodeKindOf({ type, data });

  // What the workflow check found here: errors block the run.
  const problems = useNodeProblems(id);
  const problemLevel = problems.some((problem) => problem.level === "error")
    ? "error"
    : problems.length > 0
      ? "warning"
      : null;

  // Conditional classes based on node state
  if (problemLevel === "error") {
    nodeClasses.push("ring-2", "ring-red-500", "border-red-500");
  } else if (data._hasWarning) {
    // Warning state takes precedence: missing files or content
    nodeClasses.push(
      "ring-2",
      "ring-yellow-500",
      "border-yellow-500",
      "bg-yellow-50"
    );
    // If selected AND has warning, add extra glow
    if (selected || data.isHighlight) {
      nodeClasses.push("shadow-lg", "shadow-yellow-500/50");
    }
  } else if (selected || data.isHighlight) {
    nodeClasses.push("ring-2", "ring-nextflow-green", "border-transparent");
  } else {
    nodeClasses.push("border-gray-600"); // Default border
  }

  if (status === "running") {
    nodeClasses.push(
      "border-yellow-400",
      "border-2",
      "animate-pulse",
      "bg-yellow-50"
    );
  } else if (status === "success") {
    nodeClasses.push("border-green-500", "border-2", "bg-green-50");
  } else if (status === "error") {
    nodeClasses.push("border-red-500", "border-2", "bg-red-50");
  } else if (status === "waiting") {
    nodeClasses.push("border-purple-400", "border-2", "bg-purple-50");
  } else if (status === "disabled") {
    nodeClasses.push("opacity-60", "bg-gray-100");
  }

  return (
    <div
      className={clsx(nodeClasses, {
        "shadow-lg shadow-nextflow-green/50": selected || data.isHighlight,
      })}
      style={{ minHeight: dynamicMinHeight, minWidth: dynamicMinWidth }}
    >
      {/* What kind of node this is, in the colors of the workflow previews. */}
      {kind && (
        <div
          aria-hidden="true"
          data-kind={kind}
          title={NODE_KINDS[kind].label}
          className="absolute inset-x-0 top-0 h-1.5 rounded-t-lg"
          style={{ backgroundColor: NODE_KINDS[kind].color }}
        />
      )}

      {/* Input Handles */}
      {data.inputs?.map((port, index, arr) => {
        const fit = fitOf(port.name);
        const detail = port.fileType || port.filePattern
          ? [port.fileType, port.filePattern].filter(Boolean).join(" ")
          : portSummary({ type, data }, port.name, "inputs");
        // A taller handle takes any number of connections; a dot takes one.
        const many = acceptsManyConnections(
          { id, type, data, position: { x: 0, y: 0 } },
          port.name,
        );
        return (
        <div
          key={port.name}
          className="group/port absolute left-0"
          style={{ top: `${(100 / (arr.length + 1)) * (index + 1)}%` }}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={port.name}
            className={clsx(
              "!-left-1.5",
              many ? "!w-3 !h-6 !rounded-full" : "!w-3 !h-3",
              fit?.fits === true && "!bg-nextflow-green ring-4 ring-nextflow-green/40",
              fit?.fits === false && "!bg-yellow-400 ring-4 ring-yellow-300/70",
              !fit && "!bg-gray-400",
            )}
            data-fit={fit ? (fit.fits ? "fits" : "mismatch") : undefined}
            data-connections={many ? "many" : "one"}
            title={fit?.message}
            isConnectable={isConnectable}
            onMouseDown={onMouseDown}
          />
          {(port.label || many) && (
            // Hovering the node names each port in one short line, so the
            // labels of a node with many ports don't overlap; hovering a
            // port also shows what it takes.
            <div className={clsx(PORT_LABEL_CLASS, "right-3")}>
              <div className="text-[10px] leading-tight text-gray-600">{port.label || port.name}</div>
              {detail && <div className={PORT_DETAIL_CLASS}>{detail}</div>}
              <div className={PORT_DETAIL_CLASS}>
                {many ? "any number of connections, mixed" : "one connection"}
              </div>
            </div>
          )}
        </div>
        );
      })}

      <div className="flex items-center justify-center w-10 h-10 mb-1">
        <DynamicIcon name={iconName} className="w-8 h-8 text-gray-700" />
      </div>

      <div className="text-center">
        <div className="text-xs font-semibold text-gray-800 truncate">
          {data.label || "Unnamed Node"}
        </div>
        {(data.subtitle || type) && (
          <div className="text-[10px] text-gray-500 truncate">
            {data.subtitle || type}
          </div>
        )}
        {data.note && (
          <div className="text-[8px] text-gray-400 truncate mt-0.5">
            {data.note}
          </div>
        )}
      </div>

      {/* Execution Status Indicator */}
      {status && status !== "disabled" && (
        <div className="absolute top-2 right-2">
          {status === "running" && (
            <div
              className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"
              title="Running"
            />
          )}
          {status === "success" && (
            <div
              className="w-3 h-3 bg-green-500 rounded-full"
              title="Completed"
            />
          )}
          {status === "error" && (
            <div className="w-3 h-3 bg-red-500 rounded-full" title="Failed" />
          )}
          {status === "waiting" && (
            <div
              className="w-3 h-3 bg-purple-400 rounded-full"
              title="Waiting"
            />
          )}
        </div>
      )}

      {/* The workflow check's problems; the full text shows on hover. */}
      {problemLevel && (
        <span
          role="img"
          aria-label={`${problemLevel === "error" ? "Problem" : "Warning"}: ${problems.map((problem) => problem.message).join(" ")}`}
          title={problems.map((problem) => problem.message).join("\n")}
          className={clsx(
            "absolute -top-3 -left-3 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full border px-1 text-[10px] font-semibold shadow-sm",
            problemLevel === "error"
              ? "border-red-500 bg-red-100 text-red-700"
              : "border-yellow-500 bg-yellow-100 text-yellow-800",
          )}
        >
          {problemLevel === "error" ? (
            <XCircle className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          )}
          {problems.length > 1 && problems.length}
        </span>
      )}

      {/* What the last run did here; double-click shows its results. */}
      {run && (
        <output
          aria-label={`Last run: ${run.status}`}
          title={
            run.status === "running"
              ? "This step is running"
              : ignoredErrors > 0
                ? "Some tasks failed, but the pipeline is set to go on without them. Double-click to see which."
                : "Double-click to see what this step produced"
          }
          className={clsx(
            "absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-sm",
            run.status === "running" &&
              "border-yellow-400 bg-yellow-100 text-yellow-900",
            run.status === "succeeded" &&
              ignoredErrors === 0 &&
              "border-green-500 bg-green-100 text-green-900",
            ignoredErrors > 0 && "border-amber-500 bg-amber-100 text-amber-900",
            run.status === "cached" &&
              "border-sky-500 bg-sky-100 text-sky-900",
            run.status === "failed" && "border-red-500 bg-red-100 text-red-900"
          )}
        >
          {run.status === "running"
            ? `Running${run.total > 1 ? ` ${run.done}/${run.total}` : ""}`
            : run.status === "failed"
              ? `Failed${run.total > 1 ? ` ${run.failed}/${run.total}` : ""}`
              : ignoredErrors > 0
                ? `Results ready, ${ignoredErrors} error${ignoredErrors === 1 ? "" : "s"} ignored`
                : run.status === "cached"
                  ? "Reused from cache"
                  : "Results ready"}
        </output>
      )}

      {/* Render children if they exist */}
      {children}

      {/* Output Handles */}
      {data.outputs?.map((port, index, arr) => (
        <div
          key={port.name}
          className="group/port absolute right-0"
          style={{ top: `${(100 / (arr.length + 1)) * (index + 1)}%` }}
        >
          <Handle
            type="source"
            position={Position.Right}
            id={port.name}
            className="!w-3 !h-3 !-right-1.5 !bg-gray-400"
            isConnectable={port.isConnectable ?? true}
            onMouseDown={onMouseDown}
          />
          {port.label && (
            <div className={clsx(PORT_LABEL_CLASS, "left-3")}>
              <div className="text-[10px] leading-tight text-gray-600">{port.label}</div>
              {(port.fileType || port.filePattern || portSummary({ type, data }, port.name, "outputs")) && (
                <div className={PORT_DETAIL_CLASS}>
                  {port.fileType || port.filePattern
                    ? [port.fileType, port.filePattern].filter(Boolean).join(" ")
                    : portSummary({ type, data }, port.name, "outputs")}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default memo(BaseNode);
