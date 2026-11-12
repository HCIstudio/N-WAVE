// How the graph views draw a workflow's code: processes as boxes, channel
// operations as small rounded pills, a collapsed subworkflow as a stack, an
// expanded one as a frame around what it holds. Nothing here can be edited.

import { Handle, type NodeProps, Position } from "@xyflow/react";
import clsx from "clsx";
import { ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import type React from "react";
import { memo } from "react";

/** How a node stands to the one selected (or to the longest chain). */
export type Emphasis = "selected" | "upstream" | "downstream" | "path" | "dim" | "none";

export interface GraphNodeData extends Record<string, unknown> {
  kind: "step" | "operation" | "cluster";
  label: string;
  /** A step's subworkflow path or a collapsed cluster's workflow, small under the label. */
  detail?: string;
  conditional?: boolean;
  emphasis: Emphasis;
  /** A collapsed cluster: opens it. */
  onExpand?: () => void;
}

export interface GraphFrameData extends Record<string, unknown> {
  name: string;
  workflow: string;
  emphasis: Emphasis;
  onCollapse: () => void;
}

const EMPHASIS: Record<Emphasis, string> = {
  selected: "ring-4 ring-blue-500",
  upstream: "ring-2 ring-sky-400",
  downstream: "ring-2 ring-amber-400",
  path: "ring-2 ring-emerald-400",
  dim: "opacity-30",
  none: "",
};

// Edges need handles; these are invisible: nothing can be connected here.
const hidden = "!pointer-events-none !h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";
const Handles = () => (
  <>
    <Handle type="target" position={Position.Left} isConnectable={false} className={hidden} />
    <Handle type="source" position={Position.Right} isConnectable={false} className={hidden} />
  </>
);

export const GraphNode = memo(({ data }: NodeProps) => {
  const { kind, label, detail, conditional, emphasis, onExpand } = data as GraphNodeData;
  if (kind === "operation") {
    return (
      <div
        title={label}
        className={clsx(
          "flex h-full w-full items-center justify-center rounded-full border border-dashed border-slate-400 bg-slate-100 px-3 font-mono text-[11px] text-slate-700 transition-opacity",
          EMPHASIS[emphasis],
        )}
      >
        <Handles />
        <span className="truncate">{label}</span>
      </div>
    );
  }
  if (kind === "cluster") {
    return (
      <div className={clsx("relative h-full w-full transition-opacity", emphasis === "dim" && "opacity-30")}>
        <div aria-hidden className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-md border-2 border-indigo-300 bg-indigo-50" />
        <div
          className={clsx(
            "relative flex h-full w-full flex-col justify-center rounded-md border-2 border-indigo-400 bg-white px-3 text-left",
            emphasis !== "dim" && EMPHASIS[emphasis],
          )}
        >
          <Handles />
          <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
            <span className="truncate">{label}</span>
            {onExpand && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onExpand();
                }}
                aria-label={`Expand ${label}`}
                title="Show the processes inside"
                className="nodrag ml-auto rounded p-0.5 text-indigo-600 hover:bg-indigo-100"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </span>
          {detail && <span className="truncate text-[11px] text-slate-500">{detail}</span>}
        </div>
      </div>
    );
  }
  return (
    <div
      title={label}
      className={clsx(
        "flex h-full w-full flex-col justify-center rounded-md border border-slate-300 bg-white px-3 text-left shadow-sm transition-opacity",
        EMPHASIS[emphasis],
      )}
    >
      <Handles />
      <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
        <span className="truncate">{label}</span>
        {conditional && (
          <span title="Runs under a condition" className="ml-auto flex shrink-0 items-center gap-0.5 rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-700">
            <GitBranch className="h-3 w-3" aria-hidden />
            if
          </span>
        )}
      </span>
      {detail && <span className="truncate text-[11px] text-slate-500">{detail}</span>}
    </div>
  );
});
GraphNode.displayName = "GraphNode";

/** An expanded subworkflow: a frame around what it holds; its header collapses it. */
export const GraphFrame: React.FC<NodeProps> = ({ data }) => {
  const { name, workflow, emphasis, onCollapse } = data as GraphFrameData;
  return (
    <section
      aria-label={`Subworkflow ${name}`}
      className={clsx(
        "pointer-events-none h-full w-full rounded-lg border-2 border-dashed border-indigo-300/80 bg-indigo-300/10 transition-opacity",
        emphasis === "dim" && "opacity-40",
      )}
    >
      <header className="pointer-events-auto flex items-center gap-1 px-2 py-1 text-xs text-indigo-100">
        <button
          type="button"
          onClick={onCollapse}
          aria-label={`Collapse ${name}`}
          title="Collapse to one box"
          className="nodrag rounded p-0.5 hover:bg-white/10"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="font-semibold">{name}</span>
        {workflow !== name && <span className="opacity-75">({workflow})</span>}
        <span className="opacity-75">· subworkflow</span>
      </header>
    </section>
  );
};

export const graphNodeTypes = { graphNode: GraphNode, graphFrame: GraphFrame };
