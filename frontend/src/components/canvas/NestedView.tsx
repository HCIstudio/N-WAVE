import type React from "react";
import { memo, useCallback, useEffect, useId, useMemo, useState } from "react";
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
import { ArrowDownToDot, ChevronRight, Loader, X } from "lucide-react";
import NodeStack, { STACK_BORDER, type StackTone } from "../nodes/NodeStack";
import type { RunTask } from "../../api/runs";
import { logActivity } from "../../activity/activityLog";
import { loadWorkflowGraph } from "../../workflows/nested/loadWorkflow";
import { layoutGraph, nestedSource, STEP_HEIGHT, STEP_WIDTH, type StepRun, stepRun, type WorkflowSource } from "../../workflows/nested/nestedGraph";
import type { NestedEntry } from "../../workflows/nested/nestedEntry";
import type { WorkflowGraph, WorkflowStep } from "../../workflows/nested/workflowGraph";
import { getApiErrorMessage } from "../../utils/errors";

interface Level {
  title: string;
  source: WorkflowSource;
  /** How Nextflow names this level's tasks; unset: after the workflow read. */
  path?: string[];
}

interface StepData extends Record<string, unknown> {
  label: string;
  kind: string;
  /** From nf-core (modules or subworkflows), or the pipeline's own. */
  nfCore: boolean;
  run: StepRun | null;
  /** Whether a run is going (steps without tasks yet are waiting). */
  isRunning: boolean;
  onOpen?: () => void;
}

const STATUS_TEXT: Record<StepRun["status"], string> = {
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  cached: "Reused from cache",
};

/** One step of the nested graph; a subworkflow opens on click. */
const StepNode = memo(({ data }: NodeProps<Node<StepData>>) => {
  const { label, kind, nfCore, run, isRunning, onOpen } = data;
  const isEnd = kind === "input" || kind === "output";
  const status = run
    ? `${STATUS_TEXT[run.status]}${run.total > 1 ? ` ${run.status === "failed" ? run.failed : run.done}/${run.total}` : ""}`
    : isRunning && !isEnd
      ? "Waiting"
      : "";
  const content = (
    <>
      <span className="flex items-center justify-between gap-1.5 text-xs font-semibold text-gray-800">
        <span className="truncate">{label}</span>
        {onOpen && (
          <span className="flex shrink-0 items-center gap-0.5 rounded bg-gray-100 px-1 text-[10px] font-medium text-gray-700">
            <ArrowDownToDot className="h-3 w-3" aria-hidden />
            Step in
          </span>
        )}
      </span>
      <span className="block truncate text-[10px] text-gray-600">
        {isEnd ? "" : kind === "module" ? "process" : kind}
        {status && <span className="ml-1 font-medium">· {status}</span>}
      </span>
    </>
  );
  // Steps with steps inside are stacks: all their cards share the border.
  const tone: StackTone =
    run?.status === "failed"
      ? "error"
      : run?.status === "running"
        ? "running"
        : run?.status === "cached"
          ? "cached"
          : run?.status === "succeeded"
            ? "success"
            : nfCore
              ? "nfcore"
              : "default";
  const className = clsx(
    "h-full w-full rounded-md border-2 bg-white px-2 py-1.5 text-left",
    !onOpen && "shadow-sm",
    isEnd && "rounded-full border-dashed bg-gray-100 text-center",
    // A stack's border is the same on all its cards; a single step's by its state.
    onOpen
      ? ["rounded-lg", STACK_BORDER[tone]]
      : [
          !run && !isEnd && (nfCore ? "border-nextflow-green" : "border-gray-400"),
          run?.status === "running" && "border-yellow-400",
          run?.status === "succeeded" && "border-green-600",
          run?.status === "failed" && "border-red-500",
          run?.status === "cached" && "border-sky-500",
        ],
    run?.status === "running" && "bg-yellow-50",
    run?.status === "succeeded" && "bg-green-50",
    run?.status === "failed" && "bg-red-50",
    run?.status === "cached" && "bg-sky-50",
  );
  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" isConnectable={false} />
      {onOpen ? (
        <div className="relative h-full w-full">
          <NodeStack tone={tone} />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          className={className}
          title={`Step in: show the steps inside ${label}`}
        >
          {content}
        </button>
        </div>
      ) : (
        <div className={className} data-status={run?.status ?? (status ? "waiting" : "none")}>
          {content}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!opacity-0" isConnectable={false} />
    </>
  );
});
StepNode.displayName = "StepNode";

const nodeTypes = { step: StepNode };
const ignoreClick = () => {};

interface NestedViewProps {
  /** The canvas node opened, and where its steps come from. */
  title: string;
  entry: NestedEntry;
  /** The workflow on the canvas, the breadcrumb's start. */
  workflowName: string;
  /** The node's tasks in the last run. */
  tasks: RunTask[];
  isRunning: boolean;
  onClose: () => void;
}

/**
 * The steps inside a subworkflow or pipeline node, read-only, with what the
 * last run did in each. Subworkflows inside open in turn; the breadcrumb
 * leads back out.
 */
const NestedView: React.FC<NestedViewProps> = ({ title, entry, workflowName, tasks, isRunning, onClose }) => {
  const headingId = useId();
  const [levels, setLevels] = useState<Level[]>([{ title, source: entry.source, path: entry.path }]);
  const level = levels[levels.length - 1];
  const [graph, setGraph] = useState<WorkflowGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt reads again.
  useEffect(() => {
    let cancelled = false;
    setGraph(null);
    setError(null);
    loadWorkflowGraph(level.source).then(
      (loaded) => !cancelled && setGraph(loaded),
      (caught: unknown) =>
        !cancelled && setError(getApiErrorMessage(caught, "The steps inside couldn't be read.")),
    );
    return () => {
      cancelled = true;
    };
  }, [level, attempt]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const path = useMemo(() => level.path ?? (graph ? [graph.name] : []), [level.path, graph]);

  const open = useCallback(
    (step: WorkflowStep) => {
      const source = nestedSource(level.source, step);
      if (!source) return;
      logActivity("nested.opened", { step: step.id, depth: levels.length });
      setLevels((current) => [...current, { title: step.id, source, path: [...path, step.id] }]);
    },
    [level.source, levels.length, path],
  );

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [] as Node<StepData>[], edges: [] as Edge[] };
    const laidOut = layoutGraph(graph);
    const runs = new Map(laidOut.map((item) => [item.id, item.step ? stepRun(tasks, path, item.step) : null]));
    const flowNodes: Node<StepData>[] = laidOut.map((item) => ({
      id: item.id,
      type: "step",
      position: item.position,
      width: STEP_WIDTH,
      height: STEP_HEIGHT,
      draggable: false,
      selectable: false,
      data: {
        label: item.kind === "input" ? "Inputs" : item.kind === "output" ? "Outputs" : item.id,
        kind: item.kind,
        nfCore: Boolean(item.step?.include?.includes("nf-core")),
        run: runs.get(item.id) ?? null,
        isRunning,
        ...(item.step && nestedSource(level.source, item.step)
          ? { onOpen: () => open(item.step as WorkflowStep) }
          : {}),
      },
    }));
    const flowEdges: Edge[] = graph.edges.map((edge) => ({
      id: `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
      animated: runs.get(edge.target)?.status === "running",
      style: { stroke: "#9ca3af" },
    }));
    return { nodes: flowNodes, edges: flowEdges };
  }, [graph, tasks, path, isRunning, level.source, open]);

  return (
    <div className="fixed inset-0 z-40 flex bg-black/50 p-4 sm:p-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-panel-border bg-panel-background shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-panel-border px-4 py-2">
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-text-light">
              <li>
                <button type="button" onClick={onClose} className="hover:text-text hover:underline">
                  {workflowName || "Workflow"}
                </button>
              </li>
              {levels.map((item, index) => (
                <li
                  key={levels
                    .slice(0, index + 1)
                    .map((part) => part.title)
                    .join("/")}
                  className="flex items-center gap-1"
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  {index === levels.length - 1 ? (
                    <span id={headingId} aria-current="page" className="font-semibold text-text">
                      {item.title}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLevels((current) => current.slice(0, index + 1))}
                      className="hover:text-text hover:underline"
                    >
                      {item.title}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the steps inside"
            className="rounded p-1 text-text-light hover:bg-accent hover:text-text"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="relative min-h-0 flex-1">
          {error ? (
            <div role="alert" className="p-6 text-sm text-text">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setAttempt((count) => count + 1)}
                className="mt-2 rounded-md border border-panel-border px-3 py-1.5 text-text hover:bg-accent"
              >
                Try again
              </button>
            </div>
          ) : !graph ? (
            <p className="flex items-center gap-2 p-6 text-sm text-text-light">
              <Loader className="h-4 w-4 animate-spin" aria-hidden />
              Reading the steps inside…
            </p>
          ) : graph.steps.length === 0 ? (
            <p className="p-6 text-sm text-text-light">No steps found in its workflow.</p>
          ) : (
            <ReactFlowProvider>
              <ReactFlow
                aria-label={`Steps inside ${level.title}`}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                // Without a click handler React Flow lets no clicks through to
                // steps that can't be selected or dragged (the buttons open).
                onNodeClick={ignoreClick}
                fitView
                minZoom={0.1}
                proOptions={{ hideAttribution: true }}
              >
                <Background gap={24} />
              </ReactFlow>
            </ReactFlowProvider>
          )}
        </div>
        <footer className="border-t border-panel-border px-4 py-2 text-xs text-text-light">
          Read-only, from the workflow&apos;s main.nf. Stacked steps have steps of their own: click{" "}
          <span className="whitespace-nowrap">
            <ArrowDownToDot className="inline h-3 w-3" aria-hidden /> Step in
          </span>{" "}
          to see them. Colors show what the last run did in each.
        </footer>
      </section>
    </div>
  );
};

export default NestedView;
