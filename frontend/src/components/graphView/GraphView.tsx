// A read-only view of the workflow's code, in place of the editor: the
// specification graph or the process dependency graph, from BioFlow-Insight's
// analysis of the generated code (analysis/graphViews.ts). Drawn as a
// blueprint with a title block, so it can't be mistaken for the editor, with
// a side panel of what the structure tells. Opening it analyses the workflow
// when its analysis isn't current.

import {
  Background,
  BackgroundVariant,
  type Edge,
  MarkerType,
  MiniMap,
  type Node,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from "@xyflow/react";
import { Loader, Minimize2, Maximize2, PanelRightClose, PanelRightOpen, RefreshCw } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { logActivity } from "../../activity/activityLog";
import { nodesOfSteps, BIOFLOW_PAPER_URL } from "../../analysis/bioflow";
import {
  CLUSTER_PREFIX,
  type GraphKind,
  type GraphModel,
  graphModel,
  layoutGraph,
  reachOf,
  shownGraph,
  structureInsight,
} from "../../analysis/graphViews";
import type { WorkflowAnalysisState } from "../../analysis/useWorkflowAnalysis";
import { useAnalysisProgress } from "../../analysis/useAnalysisProgress";
import AnalysisProgress from "../canvas/AnalysisProgress";
import { wikiUrl } from "../../docs/links";
import CustomControls from "../canvas/CustomControls";
import Term from "../common/ui/Term";
import { NeedsInstallNote } from "../common/ui/NeedsInstall";
import GraphInsight, { type Selection } from "./GraphInsight";
import { type Emphasis, type GraphFrameData, type GraphNodeData, graphNodeTypes } from "./GraphNodes";

/** The smallest zoom a graph opens at: below it, names can't be read. */
const READABLE_ZOOM = 0.55;

export const GRAPH_VIEWS: Record<GraphKind, { title: string; help: string }> = {
  specification: {
    title: "Specification graph",
    help: "Everything the code does, as Nextflow will run it: each process (box) and each channel operation (pill), connected by the channels between them; subworkflows are frames. Check that the code does what the editor shows, and find logic that only the code has.",
  },
  dependencies: {
    title: "Process dependency graph",
    help: "Only the processes: an arrow where one's output reaches another, through any channel operations. Select a process to see what it depends on and what a change to it affects; collapse subworkflows to see the workflow as its parts.",
  },
};

/** Why a graph view can't be shown: the demo (no server) or the analysis switched off. */
export interface GraphUnavailable {
  reason: string;
  /** In the browser demo: say a full install is needed. */
  demo: boolean;
}

interface GraphViewProps {
  kind: GraphKind;
  analysis: WorkflowAnalysisState;
  unavailable: GraphUnavailable | null;
  onBack: () => void;
  /** Leaves the view and shows the canvas node. */
  onShowInEditor: (nodeId: string) => void;
}

const TitleBlock: React.FC<{ kind: GraphKind; onBack: () => void; status?: React.ReactNode }> = ({ kind, onBack, status }) => (
  // The title block of a drawing: which view this is, and what it is for.
  <section aria-label={`${GRAPH_VIEWS[kind].title} view`} className="blueprint-title-block">
    <span className="blueprint-title flex items-center gap-1">
      {GRAPH_VIEWS[kind].title}
      <Term id={kind === "specification" ? "specification-graph" : "process-dependency-graph"} />
    </span>
    <span className="blueprint-subtitle">Read-only · not the editor</span>
    <p className="blueprint-help">
      {GRAPH_VIEWS[kind].help} Drawn from the workflow&apos;s generated code by{" "}
      <a href={BIOFLOW_PAPER_URL} target="_blank" rel="noreferrer" className="underline">
        BioFlow-Insight
      </a>
      ;{" "}
      <a href={wikiUrl({ page: "Workflow-Analysis", anchor: "graph-views" })} target="_blank" rel="noreferrer" className="underline">
        how to read it
      </a>
      .
    </p>
    {status}
    <button
      type="button"
      onClick={onBack}
      className="mt-2 self-start rounded border border-current px-2 py-0.5 text-xs normal-case tracking-normal hover:bg-white/10"
    >
      Back to the editor
    </button>
  </section>
);

const Blueprint: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <>
    {/* Blueprint paper: a fine grid, and a major line every fifth. */}
    <Background id="blueprint-minor" variant={BackgroundVariant.Lines} gap={24} lineWidth={0.5} color="rgba(186, 220, 255, 0.16)" />
    <Background id="blueprint-major" variant={BackgroundVariant.Lines} gap={120} lineWidth={1} color="rgba(186, 220, 255, 0.32)" />
    {children}
  </>
);

/** A message in the middle of the paper, when there is no graph to draw. */
const Message: React.FC<{
  kind: GraphKind;
  onBack: () => void;
  children: React.ReactNode;
  greyed?: boolean;
  /** Announced as a status (unset when what it holds announces itself). */
  status?: boolean;
}> = ({ kind, onBack, children, greyed = false, status = true }) => (
  <div className="graph-view relative h-full w-full" data-graph-view={kind} data-unavailable={greyed || undefined}>
    <ReactFlowProvider>
      <ReactFlow nodes={[]} edges={[]} proOptions={{ hideAttribution: true }} panOnDrag={false} zoomOnScroll={false}>
        <Blueprint />
        <Panel position="top-left">
          <TitleBlock kind={kind} onBack={onBack} />
        </Panel>
      </ReactFlow>
    </ReactFlowProvider>
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div
        role={status ? "status" : undefined}
        className={`pointer-events-auto max-w-md rounded-lg border border-sky-300/50 bg-[#10345e]/90 p-4 text-sm text-sky-50 shadow-xl ${greyed ? "opacity-90" : ""}`}
      >
        {children}
      </div>
    </div>
  </div>
);

const GraphView: React.FC<GraphViewProps> = ({ kind, analysis, unavailable, onBack, onShowInEditor }) => {
  const { analysis: result, structureCurrent, running, error, analyse } = analysis;
  const progress = useAnalysisProgress(running);

  // Opening the view analyses the workflow when its analysis isn't of the steps as they are.
  const requested = useRef(false);
  useEffect(() => {
    if (unavailable || structureCurrent || running || requested.current) return;
    requested.current = true;
    void analyse();
  }, [unavailable, structureCurrent, running, analyse]);

  if (unavailable) {
    return (
      <Message kind={kind} onBack={onBack} greyed>
        <p className="font-semibold">{GRAPH_VIEWS[kind].title} isn&apos;t available here</p>
        <p className="mt-1 text-sky-100/90">{unavailable.reason}</p>
        {unavailable.demo && <NeedsInstallNote className="mt-3 !text-sky-100" />}
      </Message>
    );
  }
  if (!result || (!structureCurrent && running)) {
    if (error && !running) {
      return (
        <Message kind={kind} onBack={onBack}>
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => void analyse()}
            className="mt-3 flex items-center gap-1 rounded border border-sky-200/60 px-2 py-0.5 text-xs hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
          </button>
        </Message>
      );
    }
    return (
      <Message kind={kind} onBack={onBack} status={false}>
        <p className="mb-2 font-semibold">BioFlow-Insight is reading the workflow&apos;s code</p>
        {progress ? <AnalysisProgress progress={progress} tone="blueprint" /> : <Loader className="h-4 w-4 animate-spin" aria-hidden />}
      </Message>
    );
  }
  if (result.bioflow.status !== "done") {
    return (
      <Message kind={kind} onBack={onBack}>
        <p className="font-semibold">BioFlow-Insight couldn&apos;t read the workflow</p>
        <p className="mt-1 text-sky-100/90">{result.bioflow.reason}</p>
      </Message>
    );
  }
  const model = graphModel(result.bioflow.result, kind);
  if (!model) {
    return (
      <Message kind={kind} onBack={onBack}>
        BioFlow-Insight couldn&apos;t read the channels of this workflow, so there is no specification graph. The
        process dependency graph may still show its processes.
      </Message>
    );
  }
  if (model.nodes.length === 0) {
    return (
      <Message kind={kind} onBack={onBack}>
        No processes in the workflow&apos;s code. A workflow that runs a whole pipeline (a Pipeline node) calls it as
        one command: its processes are the pipeline&apos;s own.
      </Message>
    );
  }
  const stepNodes = nodesOfSteps(result.bioflow.result, result.names);
  return (
    <ReactFlowProvider key={kind}>
      <DrawnGraph
        kind={kind}
        model={model}
        stale={!structureCurrent}
        running={running}
        onAnalyse={() => void analyse()}
        nodeOfStep={stepNodes}
        onBack={onBack}
        onShowInEditor={onShowInEditor}
      />
    </ReactFlowProvider>
  );
};

const subworkflowPath = (model: GraphModel, cluster: string | null): string | null => {
  const names: string[] = [];
  const byId = new Map(model.clusters.map((entry) => [entry.id, entry]));
  let current = cluster;
  while (current && byId.has(current)) {
    names.unshift(byId.get(current)?.name ?? current);
    current = byId.get(current)?.parent ?? null;
  }
  return names.length > 0 ? `in ${names.join(" › ")}` : null;
};

const DrawnGraph: React.FC<{
  kind: GraphKind;
  model: GraphModel;
  stale: boolean;
  running: boolean;
  onAnalyse: () => void;
  nodeOfStep: Map<string, string>;
  onBack: () => void;
  onShowInEditor: (nodeId: string) => void;
}> = ({ kind, model, stale, running, onAnalyse, nodeOfStep, onBack, onShowInEditor }) => {
  const { fitView, setViewport } = useReactFlow();
  const paneWidth = useStore((store) => store.width);
  const paneHeight = useStore((store) => store.height);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [showPath, setShowPath] = useState(false);
  const [insightOpen, setInsightOpen] = useState(true);

  const shown = useMemo(() => shownGraph(model, collapsed), [model, collapsed]);
  const layout = useMemo(() => layoutGraph(shown), [shown]);
  const insight = useMemo(() => structureInsight(model), [model]);
  const reach = useMemo(() => reachOf(model), [model]);
  const byId = useMemo(() => new Map(model.nodes.map((node) => [node.id, node])), [model]);

  // Fit what is drawn when it changes (collapsing, expanding); a graph too
  // long to read whole starts at its beginning, at a size that can be read.
  useEffect(() => {
    if (!paneWidth || !paneHeight) return;
    const rects = [...layout.nodes.values(), ...layout.frames.values()];
    if (rects.length === 0) return;
    const left = Math.min(...rects.map((rect) => rect.x));
    const top = Math.min(...rects.map((rect) => rect.y));
    const right = Math.max(...rects.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    const fit = Math.min(paneWidth / ((right - left) * 1.15), paneHeight / ((bottom - top) * 1.15));
    if (fit >= READABLE_ZOOM) {
      void fitView({ padding: 0.15, maxZoom: 1.1 });
      return;
    }
    const zoom = Math.max(fit, READABLE_ZOOM);
    void setViewport({ x: 40 - left * zoom, y: paneHeight / 2 - ((top + bottom) / 2) * zoom, zoom });
  }, [layout, paneWidth, paneHeight, fitView, setViewport]);

  const labelOf = (id: string) => {
    const node = byId.get(id);
    return { label: node?.label ?? id, where: node ? subworkflowPath(model, node.subworkflow) : null };
  };

  // What the selected node (or a collapsed cluster, its processes) depends on and affects.
  const memberMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [nodeId, shownId] of shown.representative) map.set(shownId, [...(map.get(shownId) ?? []), nodeId]);
    return map;
  }, [shown]);
  const members = (shownId: string): string[] => memberMap.get(shownId) ?? [shownId];
  const related = useMemo(() => {
    if (!selected) return null;
    const own = new Set(memberMap.get(selected) ?? [selected]);
    const upstream = new Set<string>();
    const downstream = new Set<string>();
    for (const id of own) {
      for (const other of reach.get(id)?.upstream ?? []) if (!own.has(other)) upstream.add(other);
      for (const other of reach.get(id)?.downstream ?? []) if (!own.has(other)) downstream.add(other);
    }
    return { own, upstream, downstream };
  }, [selected, reach, memberMap]);
  const onPath = useMemo(() => new Set(showPath ? insight.path : []), [showPath, insight.path]);

  const emphasisOf = (shownId: string): Emphasis => {
    const own = members(shownId);
    if (related) {
      if (shownId === selected) return "selected";
      if (own.some((id) => related.upstream.has(id))) return "upstream";
      if (own.some((id) => related.downstream.has(id))) return "downstream";
      return "dim";
    }
    if (showPath) return own.some((id) => onPath.has(id)) ? "path" : "dim";
    return "none";
  };

  const toggle = (cluster: string, collapse: boolean) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (collapse) next.add(cluster);
      else next.delete(cluster);
      return next;
    });
    setSelected(null);
    logActivity("graph.clusterToggled", { view: kind, collapsed: collapse });
  };

  const select = (id: string | null) => {
    setSelected(id);
    if (id) {
      const kindOf = id.startsWith(CLUSTER_PREFIX) ? "cluster" : (byId.get(id)?.kind ?? "step");
      logActivity("graph.inspected", { view: kind, kind: kindOf });
    }
  };

  const flowNodes: Node[] = [
    ...shown.frames.map((frame): Node<GraphFrameData> => {
      const rect = layout.frames.get(frame.id) ?? { x: 0, y: 0, width: 0, height: 0 };
      return {
        id: `frame:${frame.id}`,
        type: "graphFrame",
        position: { x: rect.x, y: rect.y },
        width: rect.width,
        height: rect.height,
        style: { width: rect.width, height: rect.height },
        zIndex: -1,
        selectable: false,
        draggable: false,
        data: {
          name: frame.name,
          workflow: frame.workflow,
          emphasis: related || showPath ? "dim" : "none",
          onCollapse: () => toggle(frame.id, true),
        },
      };
    }),
    ...shown.nodes.map((node): Node<GraphNodeData> => {
      const rect = layout.nodes.get(node.id) ?? { x: 0, y: 0, width: 200, height: 56 };
      const source = node.source;
      return {
        id: node.id,
        type: "graphNode",
        position: { x: rect.x, y: rect.y },
        width: rect.width,
        height: rect.height,
        style: { width: rect.width, height: rect.height },
        draggable: false,
        connectable: false,
        data: {
          kind: node.kind,
          label: node.label,
          detail:
            node.kind === "cluster"
              ? `${"workflow" in source && source.workflow !== node.label ? `${source.workflow} · ` : ""}${node.holds?.steps ?? 0} processes${kind === "specification" ? `, ${node.holds?.operations ?? 0} operations` : ""}`
              : undefined,
          conditional: "conditions" in source && source.conditions.length > 0,
          emphasis: emphasisOf(node.id),
          ...(node.kind === "cluster" ? { onExpand: () => toggle(node.id.slice(CLUSTER_PREFIX.length), false) } : {}),
        },
      };
    }),
  ];

  const edgeEmphasis = (from: string, to: string): Emphasis => {
    if (related) {
      const inUp = (id: string) => id === selected || members(id).some((m) => related.upstream.has(m));
      const inDown = (id: string) => id === selected || members(id).some((m) => related.downstream.has(m));
      if (inUp(from) && inUp(to)) return "upstream";
      if (inDown(from) && inDown(to)) return "downstream";
      return "dim";
    }
    if (showPath) {
      const on = (id: string) => members(id).some((m) => onPath.has(m));
      return on(from) && on(to) ? "path" : "dim";
    }
    return "none";
  };
  const EDGE_COLOR: Record<Emphasis, string> = {
    upstream: "#38bdf8",
    downstream: "#fbbf24",
    path: "#34d399",
    selected: "#3b82f6",
    dim: "rgba(186, 220, 255, 0.15)",
    none: "rgba(219, 234, 254, 0.75)",
  };
  const flowEdges: Edge[] = shown.edges.map((edge) => {
    const emphasis = edgeEmphasis(edge.from, edge.to);
    const color = EDGE_COLOR[emphasis];
    return {
      id: `${edge.from}->${edge.to}`,
      source: edge.from,
      target: edge.to,
      selectable: false,
      label: edge.count > 1 ? `×${edge.count}` : edge.label || undefined,
      labelStyle: { fill: "#e0f2fe", fontSize: 10 },
      labelBgStyle: { fill: "#10345e" },
      style: { stroke: color, strokeWidth: emphasis === "none" || emphasis === "dim" ? 1.25 : 2.25 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      zIndex: emphasis === "none" || emphasis === "dim" ? 0 : 1,
    };
  });

  const selection: Selection | null = (() => {
    if (!selected || !related) return null;
    const base = { upstream: [...related.upstream], downstream: [...related.downstream] };
    if (selected.startsWith(CLUSTER_PREFIX)) {
      const cluster = model.clusters.find((entry) => clusterIdOf(entry.id) === selected);
      if (!cluster) return null;
      return {
        ...base,
        id: selected,
        title: cluster.name,
        kind: "cluster",
        where: cluster.workflow !== cluster.name ? `Calls ${cluster.workflow}` : null,
        conditions: [],
        code: "",
      };
    }
    const node = byId.get(selected);
    if (!node) return null;
    const editorNode = node.kind === "step" ? nodeOfStep.get(node.id) : undefined;
    return {
      ...base,
      id: node.id,
      title: node.label,
      kind: node.kind,
      where: subworkflowPath(model, node.subworkflow),
      conditions: node.conditions,
      code: node.code,
      ...(editorNode ? { onShowInEditor: () => onShowInEditor(editorNode) } : {}),
    };
  })();

  return (
    <div className="flex h-full w-full" data-graph-view={kind}>
      <div className="graph-view relative h-full min-w-0 flex-1">
        <ReactFlow
          aria-label={GRAPH_VIEWS[kind].title}
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={graphNodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          onNodeClick={(_, node) => {
            if (node.type === "graphNode") select(node.id === selected ? null : node.id);
          }}
          onPaneClick={() => select(null)}
          minZoom={0.05}
          proOptions={{ hideAttribution: true }}
        >
          <Blueprint />
          <CustomControls />
          <Panel position="top-left">
            <TitleBlock
              kind={kind}
              onBack={onBack}
              status={
                stale ? (
                  <p className="mt-1 flex items-center gap-1 text-[0.7rem] normal-case tracking-normal text-amber-200">
                    {running ? <Loader className="h-3 w-3 animate-spin" aria-hidden /> : null}
                    {running ? "Updating to the workflow as it is now…" : "The workflow changed since this was read."}
                    {!running && (
                      <button type="button" onClick={onAnalyse} className="underline">
                        Read it again
                      </button>
                    )}
                  </p>
                ) : undefined
              }
            />
          </Panel>
          <Panel position="top-right" className="flex gap-2">
            {model.clusters.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setCollapsed(new Set(model.clusters.filter((c) => c.parent === null).map((c) => c.id)));
                    setSelected(null);
                  }}
                  className="flex items-center gap-1 rounded border border-sky-200/50 bg-[#10345e]/90 px-2 py-1 text-xs text-sky-50 hover:bg-[#10345e]"
                >
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden /> Collapse subworkflows
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCollapsed(new Set());
                    setSelected(null);
                  }}
                  className="flex items-center gap-1 rounded border border-sky-200/50 bg-[#10345e]/90 px-2 py-1 text-xs text-sky-50 hover:bg-[#10345e]"
                >
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Expand all
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setInsightOpen((open) => !open)}
              aria-expanded={insightOpen}
              className="flex items-center gap-1 rounded border border-sky-200/50 bg-[#10345e]/90 px-2 py-1 text-xs text-sky-50 hover:bg-[#10345e]"
            >
              {insightOpen ? (
                <PanelRightClose className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
              )}
              {insightOpen ? "Hide insights" : "Insights"}
            </button>
          </Panel>
          <MiniMap
            pannable
            zoomable
            ariaLabel="Overview of the graph"
            position="top-right"
            className="!mt-14 !bg-[#0b2747]"
            maskColor="rgba(16, 52, 94, 0.6)"
            nodeColor={(node) => (node.type === "graphFrame" ? "rgba(165, 180, 252, 0.25)" : "#dbeafe")}
          />
        </ReactFlow>
      </div>
      {insightOpen && (
        <GraphInsight
          kind={kind}
          model={model}
          insight={insight}
          selection={selection}
          labelOf={labelOf}
          onSelect={(id) => {
            // A process inside a collapsed subworkflow is selected as that subworkflow.
            select(shown.representative.get(id) ?? id);
          }}
          showPath={showPath}
          onShowPath={(on) => {
            setShowPath(on);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
};

const clusterIdOf = (cluster: string) => `${CLUSTER_PREFIX}${cluster}`;

export default GraphView;
