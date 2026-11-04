// A BioFlow-Insight analysis of a workflow (backend/bioflow), and how its
// steps map to the canvas. The backend checks the result against its schema
// (backend/src/analysis/bioflowResult.ts); these are the same types.
//
// BioFlow-Insight: Marchment et al., NAR Genomics and Bioinformatics 6(3),
// lqae092, 2024, https://doi.org/10.1093/nargab/lqae092.

import type { Edge, Node } from "@xyflow/react";
import { processNamesFor } from "../generators/core/naming";

export const BIOFLOW_PAPER_URL = "https://doi.org/10.1093/nargab/lqae092";

export interface BioflowStep {
  /** The calls' names from the top, joined by dots: `GENOME.INDEX`. */
  id: string;
  /** The name the process is called by. */
  name: string;
  /** The process's own name. */
  process: string;
  file: string | null;
  /** The subworkflow call it's in, or null. */
  subworkflow: string | null;
  code: string;
  conditions: string[];
}

export interface BioflowGroup {
  steps: string[];
  parent: number | null;
}

export interface BioflowResult {
  schema: "n-wave-bioflow/1";
  tool: { name: string; version: string; engine: "nls" | "bioflow" | null };
  dsl: string | null;
  error: { code: string; message: string; file: string | null } | null;
  notes: string[];
  steps: BioflowStep[];
  connections: Array<{ from: string; to: string }>;
  subworkflows: Array<{
    id: string;
    name: string;
    workflow: string;
    file: string | null;
    parent: string | null;
  }>;
  conditions: Array<{ condition: string; steps: string[] }>;
  groups: Record<"condition" | "dominator" | "parallel", BioflowGroup[] | null>;
  /** Steps, channel operations (`op1`, …) and the channels between them; null when not read. */
  specification: {
    nodes: Array<{
      id: string;
      kind: "step" | "operation";
      subworkflow: string | null;
      code: string;
    }>;
    edges: Array<{ from: string; to: string; label: string }>;
  } | null;
  metrics: Record<string, number>;
}

/** A connection between two canvas nodes, `from->to`. */
export type NodeConnection = `${string}->${string}`;

/**
 * The canvas node each step of the analysis is: the node the script calls by
 * the step's top-level name (a step in a subworkflow is that subworkflow's
 * node). Names are the generated script's (processNamesFor), which is what
 * the analysis read. Steps whose name no node has are left out.
 */
export const nodesForSteps = (
  result: BioflowResult,
  nodes: Node[],
): Map<string, string> => {
  const byName = new Map<string, string>();
  for (const [nodeId, name] of processNamesFor(nodes)) byName.set(name, nodeId);
  return nodesOfSteps(result, byName);
};

/**
 * Each step's canvas node, by the nodes' names in the script: the outermost
 * of its subworkflows that is a node (an nf-core subworkflow node), else the
 * step's own (a step in a group of steps, #221, is a node of its own).
 */
export const nodesOfSteps = (
  result: BioflowResult,
  byName: Map<string, string>,
): Map<string, string> => {
  const subworkflowNames = new Map(
    result.subworkflows.map((sub) => [sub.id, sub.name]),
  );
  const mapped = new Map<string, string>();
  for (const step of result.steps) {
    const path = step.subworkflow
      ? step.id
          .split(".")
          .slice(0, -1)
          .map((id) => subworkflowNames.get(id) ?? id)
      : [];
    const nodeId = [...path, step.name]
      .map((name) => byName.get(name))
      .find(Boolean);
    if (nodeId) mapped.set(step.id, nodeId);
  }
  return mapped;
};

/** The analysis's connections between canvas nodes (inside one node dropped). */
export const bioflowNodeConnections = (
  result: BioflowResult,
  nodes: Node[],
): Set<NodeConnection> => {
  const nodeOf = nodesForSteps(result, nodes);
  const connections = new Set<NodeConnection>();
  for (const { from, to } of result.connections) {
    const a = nodeOf.get(from);
    const b = nodeOf.get(to);
    if (a && b && a !== b) connections.add(`${a}->${b}`);
  }
  return connections;
};

/**
 * Which steps' outputs reach which steps on the canvas: edges between steps,
 * and through any nodes in between that aren't steps (channel operators,
 * code nodes). `isStep` says which nodes are steps.
 */
export const canvasStepConnections = (
  nodes: Node[],
  edges: Edge[],
  isStep: (node: Node) => boolean,
): Set<NodeConnection> => {
  const steps = new Set(nodes.filter(isStep).map((node) => node.id));
  const next = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!next.has(edge.source)) next.set(edge.source, new Set());
    next.get(edge.source)?.add(edge.target);
  }
  const connections = new Set<NodeConnection>();
  for (const start of steps) {
    const seen = new Set<string>();
    const queue = [...(next.get(start) ?? [])];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      if (steps.has(current)) {
        if (current !== start) connections.add(`${start}->${current}`);
        continue;
      }
      queue.push(...(next.get(current) ?? []));
    }
  }
  return connections;
};
