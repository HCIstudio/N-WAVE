// The structure of an analysed workflow, from BioFlow-Insight's result:
//   - "steps": the process dependency graph (which step's outputs reach which),
//   - "channels": the specification graph (steps, channel operations and the
//     channels between them),
// laid out like the nested view, with metrics and as Mermaid or Dot.

import { type LaidOutStep, layoutGraph } from "../workflows/nested/nestedGraph";
import type { WorkflowGraph } from "../workflows/nested/workflowGraph";
import type { BioflowResult } from "./bioflow";

export type StructureView = "steps" | "channels";

export interface StructureNode {
  id: string;
  kind: "step" | "operation";
  /** What it shows: the step's name, an operation's code (first line). */
  label: string;
  /** The subworkflow call it's in. */
  subworkflow: string | null;
}

export interface StructureGraph {
  nodes: StructureNode[];
  edges: Array<{ from: string; to: string }>;
}

const firstLine = (code: string): string => {
  const line = code.split("\n").find((entry) => entry.trim()) ?? "";
  return line.length > 60 ? `${line.slice(0, 57)}…` : line.trim();
};

/** The graph of one view; null when BioFlow-Insight didn't give it. */
export const structureGraph = (
  result: BioflowResult,
  view: StructureView,
): StructureGraph | null => {
  const steps = new Map(result.steps.map((step) => [step.id, step]));
  if (view === "steps") {
    return {
      nodes: result.steps.map((step) => ({
        id: step.id,
        kind: "step",
        label: step.name,
        subworkflow: step.subworkflow,
      })),
      edges: result.connections.map(({ from, to }) => ({ from, to })),
    };
  }
  if (!result.specification) return null;
  return {
    nodes: result.specification.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label:
        node.kind === "step"
          ? (steps.get(node.id)?.name ?? node.id)
          : firstLine(node.code) || "operation",
      subworkflow: node.subworkflow,
    })),
    edges: result.specification.edges.map(({ from, to }) => ({ from, to })),
  };
};

/** Positions, left to right in the order data flows (as the nested view). */
export const layoutStructure = (graph: StructureGraph): LaidOutStep[] => {
  const workflow: WorkflowGraph = {
    name: "",
    steps: graph.nodes.map((node, order) => ({
      id: node.id,
      kind: "module",
      order,
    })),
    edges: graph.edges.map(({ from, to }) => ({ source: from, target: to })),
    inputs: [],
    outputs: [],
  };
  return layoutGraph(workflow);
};

/** The most steps one path through the graph goes through (a loop counts once). */
export const longestPath = (graph: StructureGraph): number => {
  const isStep = new Set(
    graph.nodes.filter((node) => node.kind === "step").map((node) => node.id),
  );
  const next = new Map<string, string[]>();
  for (const { from, to } of graph.edges)
    next.set(from, [...(next.get(from) ?? []), to]);
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const from = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const best = Math.max(0, ...(next.get(id) ?? []).map(from));
    visiting.delete(id);
    const value = best + (isStep.has(id) ? 1 : 0);
    memo.set(id, value);
    return value;
  };
  return Math.max(0, ...graph.nodes.map((node) => from(node.id)));
};

export interface StructureMetrics {
  steps: number;
  operations: number | null;
  connections: number;
  longestPath: number;
  subworkflows: number;
  conditionalSteps: number;
}

export const structureMetrics = (result: BioflowResult): StructureMetrics => {
  const steps = structureGraph(result, "steps") as StructureGraph;
  return {
    steps: result.steps.length,
    operations: result.specification
      ? result.specification.nodes.filter((node) => node.kind === "operation")
          .length
      : null,
    connections: result.connections.length,
    longestPath: longestPath(steps),
    subworkflows: result.subworkflows.length,
    conditionalSteps: result.steps.filter((step) => step.conditions.length > 0)
      .length,
  };
};

const escapeLabel = (text: string, quote: string): string =>
  text.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), `\\${quote}`);

/** As a Mermaid flowchart (left to right; operations rounded). */
export const toMermaid = (graph: StructureGraph): string => {
  const ids = new Map(
    graph.nodes.map((node, index) => [node.id, `n${index + 1}`]),
  );
  const label = (text: string) => `"${text.replace(/"/g, "#quot;")}"`;
  const lines = ["flowchart LR"];
  for (const node of graph.nodes) {
    const id = ids.get(node.id);
    lines.push(
      node.kind === "step"
        ? `    ${id}[${label(node.label)}]`
        : `    ${id}(${label(node.label)})`,
    );
  }
  for (const { from, to } of graph.edges) {
    if (ids.has(from) && ids.has(to))
      lines.push(`    ${ids.get(from)} --> ${ids.get(to)}`);
  }
  return `${lines.join("\n")}\n`;
};

/** As Graphviz Dot (steps as boxes, operations as ellipses). */
export const toDot = (graph: StructureGraph, name = "workflow"): string => {
  const lines = [`digraph "${escapeLabel(name, '"')}" {`, "    rankdir=LR;"];
  for (const node of graph.nodes) {
    lines.push(
      `    "${escapeLabel(node.id, '"')}" [label="${escapeLabel(node.label, '"')}", shape=${node.kind === "step" ? "box" : "ellipse"}];`,
    );
  }
  for (const { from, to } of graph.edges)
    lines.push(`    "${escapeLabel(from, '"')}" -> "${escapeLabel(to, '"')}";`);
  lines.push("}");
  return `${lines.join("\n")}\n`;
};
