// The two read-only views of a workflow's code, from BioFlow-Insight's
// analysis (Marchment et al., 2024):
//   - the specification graph: every process and channel operation the code
//     has, and the channels between them, as Nextflow will run it;
//   - the process dependency graph: only the processes, with an edge where
//     one's output reaches the other, whatever operations are in between.
// Both have the code's subworkflows as clusters, which can be collapsed to
// one box (abstraction: the workflow at the level of its parts). This file
// builds them, lays them out (layered, left to right, clusters kept apart),
// and works out what they tell about the workflow's structure.

import type { BioflowResult } from "./bioflow";

export type GraphKind = "specification" | "dependencies";

export interface GraphNode {
  id: string;
  kind: "step" | "operation";
  /** The process's name as called, or an operation's first line of code. */
  label: string;
  /** The subworkflow call it's in (a cluster's id), or null. */
  subworkflow: string | null;
  code: string;
  /** Conditions it runs under (`if` blocks around its call). */
  conditions: string[];
}

export interface GraphCluster {
  id: string;
  /** The name it's called by. */
  name: string;
  /** The workflow it calls. */
  workflow: string;
  parent: string | null;
}

export interface GraphModel {
  kind: GraphKind;
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string; label: string }>;
  clusters: GraphCluster[];
}

const firstLine = (code: string): string => {
  const line = code.split("\n").find((entry) => entry.trim()) ?? "";
  return line.length > 48 ? `${line.slice(0, 45).trim()}…` : line.trim();
};

/** The graph of a view; null when BioFlow-Insight didn't give it. */
export const graphModel = (result: BioflowResult, kind: GraphKind): GraphModel | null => {
  const steps = new Map(result.steps.map((step) => [step.id, step]));
  const clusters = result.subworkflows.map(({ id, name, workflow, parent }) => ({ id, name, workflow, parent }));
  const stepNode = (id: string): GraphNode => {
    const step = steps.get(id);
    return {
      id,
      kind: "step",
      label: step?.name ?? id,
      subworkflow: step?.subworkflow ?? null,
      code: step?.code ?? "",
      conditions: step?.conditions ?? [],
    };
  };
  if (kind === "dependencies") {
    return {
      kind,
      nodes: result.steps.map((step) => stepNode(step.id)),
      edges: unique(result.connections.map(({ from, to }) => ({ from, to, label: "" }))),
      clusters,
    };
  }
  if (!result.specification) return null;
  return {
    kind,
    nodes: result.specification.nodes.map((node) =>
      node.kind === "step"
        ? { ...stepNode(node.id), subworkflow: node.subworkflow ?? stepNode(node.id).subworkflow }
        : {
            id: node.id,
            kind: "operation",
            label: firstLine(node.code) || "operation",
            subworkflow: node.subworkflow,
            code: node.code,
            conditions: [],
          },
    ),
    edges: unique(result.specification.edges),
    clusters,
  };
};

const unique = <T extends { from: string; to: string }>(edges: T[]): T[] => [
  ...new Map(edges.filter((edge) => edge.from !== edge.to).map((edge) => [`${edge.from}\n${edge.to}`, edge])).values(),
];

// ---------------------------------------------------------------------------
// Collapsing clusters

export const CLUSTER_PREFIX = "cluster:";
export const clusterNodeId = (cluster: string) => `${CLUSTER_PREFIX}${cluster}`;

/** What is drawn: nodes, collapsed clusters as one box each, and the edges between them. */
export interface ShownNode {
  id: string;
  kind: "step" | "operation" | "cluster";
  label: string;
  /** The innermost expanded cluster it is drawn in, or null (the top). */
  container: string | null;
  /** A node's own; for a collapsed cluster, its id. */
  source: GraphNode | GraphCluster;
  /** For a collapsed cluster: how many steps and operations it holds. */
  holds?: { steps: number; operations: number };
}

export interface ShownGraph {
  nodes: ShownNode[];
  edges: Array<{ from: string; to: string; label: string; count: number }>;
  /** Expanded clusters that hold something drawn, drawn as frames. */
  frames: GraphCluster[];
  /** What each node of the model is drawn as: itself, or the collapsed cluster around it. */
  representative: Map<string, string>;
}

/** A cluster and its parents, innermost first. */
const chainOf = (cluster: string | null, byId: Map<string, GraphCluster>): string[] => {
  const chain: string[] = [];
  let current = cluster;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = byId.get(current)?.parent ?? null;
  }
  return chain;
};

/** The graph as drawn when `collapsed` clusters are each one box. */
export const shownGraph = (model: GraphModel, collapsed: ReadonlySet<string>): ShownGraph => {
  const byId = new Map(model.clusters.map((cluster) => [cluster.id, cluster]));
  // What a node is drawn as: the outermost collapsed cluster around it, else itself.
  const representative = new Map<string, string>();
  const containerOf = new Map<string, string | null>();
  const holds = new Map<string, { steps: number; operations: number }>();
  for (const node of model.nodes) {
    const chain = chainOf(node.subworkflow, byId);
    const outermost = [...chain].reverse().find((cluster) => collapsed.has(cluster));
    if (outermost) {
      const id = clusterNodeId(outermost);
      representative.set(node.id, id);
      containerOf.set(id, byId.get(outermost)?.parent ?? null);
      const count = holds.get(outermost) ?? { steps: 0, operations: 0 };
      if (node.kind === "step") count.steps += 1;
      else count.operations += 1;
      holds.set(outermost, count);
    } else {
      representative.set(node.id, node.id);
      containerOf.set(node.id, node.subworkflow);
    }
  }
  const nodes: ShownNode[] = [];
  const added = new Set<string>();
  for (const node of model.nodes) {
    const id = representative.get(node.id) as string;
    if (added.has(id)) continue;
    added.add(id);
    if (id === node.id) {
      nodes.push({ id, kind: node.kind, label: node.label, container: containerOf.get(id) ?? null, source: node });
    } else {
      const cluster = byId.get(id.slice(CLUSTER_PREFIX.length)) as GraphCluster;
      nodes.push({
        id,
        kind: "cluster",
        label: cluster.name,
        container: containerOf.get(id) ?? null,
        source: cluster,
        holds: holds.get(cluster.id),
      });
    }
  }
  const edges = new Map<string, { from: string; to: string; label: string; count: number }>();
  for (const edge of model.edges) {
    const from = representative.get(edge.from);
    const to = representative.get(edge.to);
    if (!from || !to || from === to) continue;
    const key = `${from}\n${to}`;
    const known = edges.get(key);
    if (known) known.count += 1;
    else edges.set(key, { from, to, label: edge.label, count: 1 });
  }
  // Frames: expanded clusters with something drawn in them (or in a cluster inside).
  const framed = new Set<string>();
  for (const node of nodes) for (const cluster of chainOf(node.container, byId)) framed.add(cluster);
  return {
    nodes,
    edges: [...edges.values()],
    frames: model.clusters.filter((cluster) => framed.has(cluster.id)),
    representative,
  };
};

// ---------------------------------------------------------------------------
// Layout: layered (Sugiyama style), left to right, each expanded cluster laid
// out on its own and placed as one block, so frames never overlap.

export const NODE_SIZE = {
  step: { width: 184, height: 52 },
  operation: { width: 136, height: 32 },
  cluster: { width: 204, height: 60 },
} as const;
const COLUMN_GAP = 56;
const ROW_GAP = 18;
const FRAME_PADDING = 20;
const FRAME_HEADER = 28;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayout {
  nodes: Map<string, Rect>;
  frames: Map<string, Rect>;
}

/** Each node's layer: the longest path to it (a loop stops at itself). */
export const layers = (ids: string[], edges: Array<{ from: string; to: string }>): Map<string, number> => {
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const { from, to } of edges) if (incoming.has(from)) incoming.get(to)?.push(from);
  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const of = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const sources = incoming.get(id) ?? [];
    const value = sources.length === 0 ? 0 : Math.max(...sources.map(of)) + 1;
    visiting.delete(id);
    layer.set(id, value);
    return value;
  };
  for (const id of ids) of(id);
  return layer;
};

/** Orders each layer to cross fewer edges: a few sweeps of the barycenter heuristic. */
const orderLayers = (
  columns: string[][],
  edges: Array<{ from: string; to: string }>,
): string[][] => {
  const order = columns.map((column) => [...column]);
  const index = new Map<string, number>();
  const reindex = () => {
    for (const column of order) for (const [i, id] of column.entries()) index.set(id, i);
  };
  reindex();
  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();
  for (const { from, to } of edges) {
    predecessors.set(to, [...(predecessors.get(to) ?? []), from]);
    successors.set(from, [...(successors.get(from) ?? []), to]);
  }
  const barycenter = (id: string, neighbours: Map<string, string[]>) => {
    const placed = (neighbours.get(id) ?? []).map((other) => index.get(other)).filter((i): i is number => i !== undefined);
    return placed.length === 0 ? (index.get(id) ?? 0) : placed.reduce((sum, i) => sum + i, 0) / placed.length;
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    const downward = sweep % 2 === 0;
    const range = downward ? order.map((_, i) => i).slice(1) : order.map((_, i) => i).reverse().slice(1);
    for (const i of range) {
      const neighbours = downward ? predecessors : successors;
      const keys = new Map(order[i].map((id) => [id, barycenter(id, neighbours)]));
      order[i].sort((a, b) => (keys.get(a) ?? 0) - (keys.get(b) ?? 0));
      reindex();
    }
  }
  return order;
};

/** Lays out what is drawn: rectangles of nodes and frames, in canvas coordinates. */
export const layoutGraph = (shown: ShownGraph): GraphLayout => {
  const frames = new Map(shown.frames.map((frame) => [frame.id, frame]));
  const byId = new Map(shown.frames.map((frame) => [frame.id, frame]));
  // The item a node or frame is at the level of `container`: itself, or the
  // frame inside `container` it's in.
  const itemAt = (container: string | null, nodeContainer: string | null, nodeId: string): string | null => {
    if (nodeContainer === container) return nodeId;
    const chain = chainOf(nodeContainer, byId);
    const index = chain.indexOf(container as string);
    if (container !== null && index === -1) return null;
    const inside = container === null ? chain[chain.length - 1] : chain[index - 1];
    return inside ? clusterNodeId(inside) : null;
  };
  const containerOfNode = new Map(shown.nodes.map((node) => [node.id, node.container]));
  const sizeOfNode = new Map(shown.nodes.map((node) => [node.id, NODE_SIZE[node.kind]]));

  const relative = new Map<string, Rect>();
  const frameRelative = new Map<string, Rect>();

  /** Lays out one level; returns its size. Positions are relative to the level. */
  const level = (container: string | null): { width: number; height: number; items: string[] } => {
    const items: string[] = [];
    for (const node of shown.nodes) if (node.container === container) items.push(node.id);
    for (const frame of frames.values()) if (frame.parent === container) items.push(clusterNodeId(frame.id));
    const sizes = new Map<string, { width: number; height: number }>();
    for (const item of items) {
      if (frames.has(item.slice(CLUSTER_PREFIX.length)) && !sizeOfNode.has(item)) {
        const inner = level(item.slice(CLUSTER_PREFIX.length));
        sizes.set(item, {
          width: inner.width + 2 * FRAME_PADDING,
          height: inner.height + 2 * FRAME_PADDING + FRAME_HEADER,
        });
      } else sizes.set(item, sizeOfNode.get(item) ?? NODE_SIZE.step);
    }
    const itemSet = new Set(items);
    const levelEdges: Array<{ from: string; to: string }> = [];
    const seen = new Set<string>();
    for (const edge of shown.edges) {
      const from = itemAt(container, containerOfNode.get(edge.from) ?? null, edge.from);
      const to = itemAt(container, containerOfNode.get(edge.to) ?? null, edge.to);
      if (!from || !to || from === to || !itemSet.has(from) || !itemSet.has(to)) continue;
      const key = `${from}\n${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      levelEdges.push({ from, to });
    }
    const layer = layers(items, levelEdges);
    const columns: string[][] = [];
    for (const item of items) {
      const column = layer.get(item) ?? 0;
      if (!columns[column]) columns[column] = [];
      columns[column].push(item);
    }
    const ordered = orderLayers(columns.filter(Boolean), levelEdges);
    const columnHeights = ordered.map(
      (column) => column.reduce((sum, item) => sum + (sizes.get(item)?.height ?? 0), 0) + ROW_GAP * (column.length - 1),
    );
    const height = Math.max(0, ...columnHeights);
    let x = 0;
    ordered.forEach((column, i) => {
      const width = Math.max(...column.map((item) => sizes.get(item)?.width ?? 0));
      let y = (height - columnHeights[i]) / 2;
      for (const item of column) {
        const size = sizes.get(item) as { width: number; height: number };
        const rect = { x: x + (width - size.width) / 2, y, ...size };
        if (sizeOfNode.has(item)) relative.set(item, rect);
        else frameRelative.set(item.slice(CLUSTER_PREFIX.length), rect);
        y += size.height + ROW_GAP;
      }
      x += width + COLUMN_GAP;
    });
    return { width: Math.max(0, x - COLUMN_GAP), height, items };
  };
  level(null);

  // Absolute positions: each level's offset is its frame's inner corner.
  const offsetOf = (container: string | null): { x: number; y: number } => {
    if (container === null) return { x: 0, y: 0 };
    const frame = frameRelative.get(container);
    const parent = offsetOf(byId.get(container)?.parent ?? null);
    return frame
      ? { x: parent.x + frame.x + FRAME_PADDING, y: parent.y + frame.y + FRAME_PADDING + FRAME_HEADER }
      : parent;
  };
  const nodes = new Map<string, Rect>();
  for (const [id, rect] of relative) {
    const offset = offsetOf(containerOfNode.get(id) ?? null);
    nodes.set(id, { ...rect, x: rect.x + offset.x, y: rect.y + offset.y });
  }
  const placedFrames = new Map<string, Rect>();
  for (const [id, rect] of frameRelative) {
    const offset = offsetOf(byId.get(id)?.parent ?? null);
    placedFrames.set(id, { ...rect, x: rect.x + offset.x, y: rect.y + offset.y });
  }
  return { nodes, frames: placedFrames };
};

// ---------------------------------------------------------------------------
// What the structure tells: dependencies between processes (through any
// operations), the longest chain, what can run side by side, hubs.

export interface StepReach {
  /** Steps whose output reaches this one (it depends on them). */
  upstream: Set<string>;
  /** Steps this one's output reaches (a change to it affects them). */
  downstream: Set<string>;
}

const adjacency = (model: GraphModel) => {
  const next = new Map<string, string[]>();
  const previous = new Map<string, string[]>();
  for (const { from, to } of model.edges) {
    next.set(from, [...(next.get(from) ?? []), to]);
    previous.set(to, [...(previous.get(to) ?? []), from]);
  }
  return { next, previous };
};

const reachable = (start: string, links: Map<string, string[]>): Set<string> => {
  const seen = new Set<string>();
  const queue = [...(links.get(start) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (seen.has(current) || current === start) continue;
    seen.add(current);
    queue.push(...(links.get(current) ?? []));
  }
  return seen;
};

/** For each node: everything upstream and downstream of it (all nodes, steps and operations). */
export const reachOf = (model: GraphModel): Map<string, StepReach> => {
  const { next, previous } = adjacency(model);
  return new Map(
    model.nodes.map((node) => [node.id, { upstream: reachable(node.id, previous), downstream: reachable(node.id, next) }]),
  );
};

/** The longest chain of steps one after the other (with the operations between them), from its start. */
export const criticalPath = (model: GraphModel): string[] => {
  const isStep = new Set(model.nodes.filter((node) => node.kind === "step").map((node) => node.id));
  const { next } = adjacency(model);
  const best = new Map<string, { steps: number; path: string[] }>();
  const visiting = new Set<string>();
  const from = (id: string): { steps: number; path: string[] } => {
    const known = best.get(id);
    if (known) return known;
    if (visiting.has(id)) return { steps: 0, path: [] };
    visiting.add(id);
    let tail = { steps: 0, path: [] as string[] };
    for (const target of next.get(id) ?? []) {
      const candidate = from(target);
      if (candidate.steps > tail.steps) tail = candidate;
    }
    visiting.delete(id);
    const value = { steps: tail.steps + (isStep.has(id) ? 1 : 0), path: [id, ...tail.path] };
    best.set(id, value);
    return value;
  };
  let longest = { steps: 0, path: [] as string[] };
  for (const node of model.nodes) {
    const candidate = from(node.id);
    if (candidate.steps > longest.steps) longest = candidate;
  }
  // Ends at its last step (operations after it don't lengthen it).
  const lastStep = longest.path.map((id) => isStep.has(id)).lastIndexOf(true);
  const firstStep = longest.path.findIndex((id) => isStep.has(id));
  return firstStep === -1 ? [] : longest.path.slice(firstStep, lastStep + 1);
};

export interface StructureInsight {
  steps: number;
  operations: number;
  /** Process-to-process dependencies (through any operations). */
  dependencies: number;
  subworkflows: number;
  conditionalSteps: number;
  /** Steps on the longest chain: the most steps a run waits for one after the other. */
  longestChain: number;
  /** That chain, from its first step to its last (operations between them included). */
  path: string[];
  /**
   * The most steps at the same depth (the same longest chain before them):
   * none depends on another, so they can run side by side.
   */
  parallelWidth: number;
  /** Steps nothing comes into: where the workflow starts. */
  entrySteps: string[];
  /** Steps nothing goes out of: its results. */
  endSteps: string[];
  /** Steps most others depend on, most first (a change to one affects the most). */
  mostDependedOn: Array<{ id: string; count: number }>;
  /** Steps that depend on the most others, most first. */
  mostDependencies: Array<{ id: string; count: number }>;
  /** Steps that run under a condition. */
  conditional: string[];
}

/** What the structure says, counted on steps (operations in between are followed through). */
export const structureInsight = (model: GraphModel): StructureInsight => {
  const steps = model.nodes.filter((node) => node.kind === "step");
  const isStep = new Set(steps.map((node) => node.id));
  const reach = reachOf(model);
  const stepsIn = (set: Set<string> | undefined) => [...(set ?? [])].filter((id) => isStep.has(id));
  // Direct step-to-step dependencies: the first steps reached through operations.
  const { next } = adjacency(model);
  const direct = new Map<string, Set<string>>();
  for (const step of steps) {
    const found = new Set<string>();
    const seen = new Set<string>();
    const queue = [...(next.get(step.id) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      if (isStep.has(current)) {
        if (current !== step.id) found.add(current);
        continue;
      }
      queue.push(...(next.get(current) ?? []));
    }
    direct.set(step.id, found);
  }
  const stepEdges = [...direct].flatMap(([from, targets]) => [...targets].map((to) => ({ from, to })));
  const depth = layers(
    steps.map((step) => step.id),
    stepEdges,
  );
  const perDepth = new Map<number, number>();
  for (const value of depth.values()) perDepth.set(value, (perDepth.get(value) ?? 0) + 1);
  const ranked = (count: (id: string) => number) =>
    steps
      .map((step) => ({ id: step.id, count: count(step.id) }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
      .slice(0, 3);
  const path = criticalPath(model);
  return {
    steps: steps.length,
    operations: model.nodes.length - steps.length,
    dependencies: stepEdges.length,
    subworkflows: model.clusters.length,
    conditionalSteps: steps.filter((step) => step.conditions.length > 0).length,
    longestChain: path.filter((id) => isStep.has(id)).length,
    path,
    parallelWidth: Math.max(0, ...perDepth.values()),
    entrySteps: steps.filter((step) => stepsIn(reach.get(step.id)?.upstream).length === 0).map((step) => step.id),
    endSteps: steps.filter((step) => stepsIn(reach.get(step.id)?.downstream).length === 0).map((step) => step.id),
    mostDependedOn: ranked((id) => stepsIn(reach.get(id)?.downstream).length),
    mostDependencies: ranked((id) => stepsIn(reach.get(id)?.upstream).length),
    conditional: steps.filter((step) => step.conditions.length > 0).map((step) => step.id),
  };
};
