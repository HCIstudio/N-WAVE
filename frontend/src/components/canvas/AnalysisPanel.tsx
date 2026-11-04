// The workflow's analysis (Analyse in the bottom bar): what nextflow lint and
// BioFlow-Insight found in its code, and its structure as BioFlow-Insight
// reads it, read-only, with metrics and downloads.

import {
  Background,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  Loader,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import type React from "react";
import { memo, useEffect, useId, useMemo, useState } from "react";
import { logActivity } from "../../activity/activityLog";
import { type AnalysisPart, analysisProblems } from "../../analysis/analysis";
import { BIOFLOW_PAPER_URL } from "../../analysis/bioflow";
import { wikiUrl } from "../../docs/links";
import {
  layoutStructure,
  type StructureView,
  structureGraph,
  structureMetrics,
  toDot,
  toMermaid,
} from "../../analysis/structure";
import type { WorkflowAnalysisState } from "../../analysis/useWorkflowAnalysis";
import { STEP_HEIGHT, STEP_WIDTH } from "../../workflows/nested/nestedGraph";
import type { NodeData } from "../nodes/BaseNode";

interface StructureNodeData extends Record<string, unknown> {
  label: string;
  kind: "step" | "operation";
  subworkflow: string | null;
  /** Shows the step's node on the canvas; unset for operations and steps inside. */
  onShow?: () => void;
}

const StructureNode = memo(({ data }: NodeProps<Node<StructureNodeData>>) => (
  <div
    className={clsx(
      "flex h-full w-full flex-col justify-center overflow-hidden border px-3 text-left",
      data.kind === "step" ? "rounded-md border-gray-300 bg-white shadow-sm" : "rounded-full border-dashed border-gray-400 bg-gray-50",
    )}
  >
    <Handle
      type="target"
      position={Position.Left}
      isConnectable={false}
      className="!opacity-0"
    />
    <span
      className={clsx(
        "truncate",
        data.kind === "step"
          ? "text-xs font-semibold text-gray-800"
          : "font-mono text-[11px] text-gray-600",
      )}
      title={data.label}
    >
      {data.label}
    </span>
    {data.subworkflow && (
      <span className="truncate text-[10px] text-gray-600">
        in {data.subworkflow}
      </span>
    )}
    {data.onShow && (
      <button
        type="button"
        onClick={data.onShow}
        className="nodrag self-start text-[10px] font-medium text-blue-700 hover:underline"
      >
        Show on canvas
      </button>
    )}
    <Handle
      type="source"
      position={Position.Right}
      isConnectable={false}
      className="!opacity-0"
    />
  </div>
));
StructureNode.displayName = "StructureNode";

const nodeTypes = { structure: StructureNode };
const ignoreClick = () => {};

const download = (text: string, fileName: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const fileBase = (name: string) =>
  name.trim().replace(/[^\w.-]+/g, "_") || "workflow";

const PartStatus: React.FC<{ part: AnalysisPart<unknown>; name: string }> = ({
  part,
  name,
}) =>
  part.status === "done" ? null : (
    <p className="flex items-start gap-1.5 text-sm text-text-light">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {name} {part.status === "unavailable" ? "isn't available" : "failed"}:{" "}
        {part.reason}
      </span>
    </p>
  );

interface AnalysisPanelProps {
  state: WorkflowAnalysisState;
  nodes: Node<NodeData>[];
  workflowName: string;
  nodeLabels: Record<string, string>;
  onShowNode: (nodeId: string) => void;
  onClose: () => void;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  state,
  nodes,
  workflowName,
  nodeLabels,
  onShowNode,
  onClose,
}) => {
  const headingId = useId();
  const [view, setView] = useState<StructureView>("steps");
  const { analysis, current, running, error, analyse } = state;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const problems = useMemo(
    () => (analysis ? analysisProblems(analysis, nodes) : []),
    [analysis, nodes],
  );
  const bioflow =
    analysis?.bioflow.status === "done" ? analysis.bioflow.result : null;
  const graph = useMemo(
    () => (bioflow ? structureGraph(bioflow, view) : null),
    [bioflow, view],
  );
  const metrics = useMemo(
    () => (bioflow ? structureMetrics(bioflow) : null),
    [bioflow],
  );

  // The canvas node of each top-level step, to show it.
  const nodeOfStep = useMemo(() => {
    const byName = new Map<string, string>();
    for (const [nodeId, name] of analysis?.names ?? [])
      byName.set(name, nodeId);
    return byName;
  }, [analysis]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph)
      return {
        flowNodes: [] as Node<StructureNodeData>[],
        flowEdges: [] as Edge[],
      };
    const positions = new Map(
      layoutStructure(graph).map((item) => [item.id, item.position]),
    );
    const flowNodes: Node<StructureNodeData>[] = graph.nodes.map((node) => {
      const nodeId =
        node.kind === "step" && !node.subworkflow
          ? nodeOfStep.get(node.label)
          : undefined;
      return {
        id: node.id,
        type: "structure",
        position: positions.get(node.id) ?? { x: 0, y: 0 },
        width: STEP_WIDTH,
        height: node.kind === "step" ? STEP_HEIGHT : 40,
        draggable: false,
        selectable: false,
        data: {
          label: node.label,
          kind: node.kind,
          subworkflow: node.subworkflow,
          ...(nodeId ? { onShow: () => onShowNode(nodeId) } : {}),
        },
      };
    });
    const flowEdges: Edge[] = graph.edges.map((edge, index) => ({
      id: `${edge.from}->${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      style: { stroke: "#9ca3af" },
    }));
    return { flowNodes, flowEdges };
  }, [graph, nodeOfStep, onShowNode]);

  const errors = problems.filter((problem) => problem.level === "error").length;
  const warnings = problems.length - errors;
  const showView = (next: StructureView) => {
    setView(next);
    logActivity("analysis.structureViewed", { view: next });
  };

  return (
    <div className="fixed inset-0 z-40 flex bg-black/50 p-4 sm:p-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-panel-border bg-panel-background shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-panel-border px-4 py-3">
          <h2 id={headingId} className="text-lg font-semibold text-text">
            Analysis of {workflowName || "the workflow"}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void analyse()}
              disabled={running}
              className="flex items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-sm text-text hover:bg-accent disabled:opacity-60"
            >
              {running ? (
                <Loader className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Analyse again
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the analysis"
              className="rounded p-1 text-text-light hover:bg-accent hover:text-text"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="max-h-[45%] overflow-y-auto border-b border-panel-border p-4 lg:max-h-none lg:w-96 lg:border-b-0 lg:border-r">
            {running && !analysis && (
              <p className="flex items-center gap-2 text-sm text-text-light">
                <Loader className="h-4 w-4 animate-spin" aria-hidden />{" "}
                Analysing the workflow&apos;s code… (the first time downloads
                the tools)
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="text-sm text-red-700 dark:text-red-400"
              >
                {error}
              </p>
            )}
            {analysis && !current && (
              <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                The workflow changed since this analysis. Analyse again to check
                it as it is.
              </p>
            )}
            {analysis && (
              <>
                <h3 className="mb-2 text-sm font-semibold text-text">
                  Code check
                </h3>
                <div className="space-y-2">
                  <PartStatus part={analysis.lint} name="nextflow lint" />
                  <PartStatus part={analysis.bioflow} name="BioFlow-Insight" />
                  {(analysis.lint.status === "done" ||
                    analysis.bioflow.status === "done") &&
                    problems.length === 0 && (
                      <p className="flex items-center gap-1.5 text-sm text-text">
                        <CheckCircle2
                          className="h-4 w-4 text-green-600"
                          aria-hidden
                        />{" "}
                        No problems found in the code.
                      </p>
                    )}
                  {problems.length > 0 && (
                    <>
                      <p className="text-sm text-text">
                        {errors > 0 &&
                          `${errors} error${errors === 1 ? "" : "s"}`}
                        {errors > 0 && warnings > 0 && ", "}
                        {warnings > 0 &&
                          `${warnings} warning${warnings === 1 ? "" : "s"}`}
                        . They are in the workflow check too; they don&apos;t
                        keep the workflow from running.
                      </p>
                      <ul
                        aria-label="Problems in the code"
                        className="space-y-2"
                      >
                        {problems.map((problem) => (
                          <li
                            key={problem.id}
                            className="flex items-start gap-1.5 text-sm text-text"
                          >
                            {problem.level === "error" ? (
                              <XCircle
                                className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                                aria-label="Error"
                              />
                            ) : (
                              <AlertTriangle
                                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                                aria-label="Warning"
                              />
                            )}
                            <span>
                              {problem.message}
                              {problem.nodeId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onShowNode(problem.nodeId as string)
                                  }
                                  className="ml-1 text-primary hover:underline"
                                >
                                  Show “
                                  {nodeLabels[problem.nodeId] ?? problem.nodeId}
                                  ”
                                </button>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                {metrics && (
                  <>
                    <h3 className="mb-2 mt-4 text-sm font-semibold text-text">
                      In numbers
                    </h3>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <dt className="text-text-light">Steps</dt>
                      <dd className="text-text">{metrics.steps}</dd>
                      {metrics.operations !== null && (
                        <>
                          <dt className="text-text-light">
                            Channel operations
                          </dt>
                          <dd className="text-text">{metrics.operations}</dd>
                        </>
                      )}
                      <dt className="text-text-light">
                        Connections between steps
                      </dt>
                      <dd className="text-text">{metrics.connections}</dd>
                      <dt className="text-text-light">Longest path</dt>
                      <dd className="text-text">
                        {metrics.longestPath} step
                        {metrics.longestPath === 1 ? "" : "s"}
                      </dd>
                      <dt className="text-text-light">Subworkflow calls</dt>
                      <dd className="text-text">{metrics.subworkflows}</dd>
                      <dt className="text-text-light">
                        Steps with a condition
                      </dt>
                      <dd className="text-text">{metrics.conditionalSteps}</dd>
                    </dl>
                  </>
                )}
                {bioflow && bioflow.notes.length > 0 && (
                  <ul className="mt-4 space-y-1 text-xs text-text-light">
                    {bioflow.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-panel-border px-4 py-2">
              <div
                role="tablist"
                aria-label="Structure"
                className="flex rounded-md border border-panel-border"
              >
                {(
                  [
                    ["steps", "Steps"],
                    ["channels", "Steps and channels"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => showView(id)}
                    className={clsx(
                      "px-3 py-1 text-sm",
                      view === id
                        ? "bg-accent font-medium text-text"
                        : "text-text-light hover:text-text",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {graph && (
                <div className="ml-auto flex gap-2">
                  {(
                    [
                      [
                        "mermaid",
                        "Mermaid",
                        ".mmd",
                        () => toMermaid(graph),
                        "text/plain",
                      ],
                      [
                        "dot",
                        "Dot",
                        ".dot",
                        () => toDot(graph, workflowName),
                        "text/vnd.graphviz",
                      ],
                    ] as const
                  ).map(([format, label, extension, make, type]) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => {
                        download(
                          make(),
                          `${fileBase(workflowName)}-${view}${extension}`,
                          type,
                        );
                        logActivity("analysis.downloaded", { format, view });
                      }}
                      className="flex items-center gap-1 rounded-md border border-panel-border px-2 py-1 text-sm text-text hover:bg-accent"
                    >
                      <Download className="h-4 w-4" aria-hidden /> {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              {!analysis ? null : !bioflow ? (
                <p className="p-6 text-sm text-text-light">
                  The structure comes from BioFlow-Insight, which isn&apos;t
                  available here.
                </p>
              ) : !graph ? (
                <p className="p-6 text-sm text-text-light">
                  BioFlow-Insight couldn&apos;t read the channels of this
                  workflow.
                </p>
              ) : graph.nodes.length === 0 ? (
                <p className="p-6 text-sm text-text-light">
                  No steps found in the workflow&apos;s code.
                </p>
              ) : (
                <ReactFlowProvider key={view}>
                  <ReactFlow
                    aria-label={
                      view === "steps"
                        ? "Steps and how they connect"
                        : "Steps, channel operations and channels"
                    }
                    nodes={flowNodes}
                    edges={flowEdges}
                    nodeTypes={nodeTypes}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    onNodeClick={ignoreClick}
                    fitView
                    fitViewOptions={{ maxZoom: 1 }}
                    minZoom={0.05}
                    proOptions={{ hideAttribution: true }}
                  >
                    <Background gap={24} />
                  </ReactFlow>
                </ReactFlowProvider>
              )}
            </div>
          </div>
        </div>

        <footer className="border-t border-panel-border px-4 py-2 text-xs text-text-light">
          Read-only, from the workflow&apos;s generated code. Structure by{" "}
          <a
            href={BIOFLOW_PAPER_URL}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-text"
          >
            BioFlow-Insight (Marchment et al., 2024)
          </a>
          ; code check by nextflow lint. Both run on this installation, without
          network.{" "}
          <a
            href={wikiUrl({ page: "Workflow-Analysis" })}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-text"
          >
            How it works
          </a>
        </footer>
      </section>
    </div>
  );
};

export default AnalysisPanel;
