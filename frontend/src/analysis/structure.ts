// A graph to export as text: the editor's canvas, or a graph view of the
// code (analysis/graphViews.ts), as Mermaid or Graphviz Dot. Subworkflows
// (clusters) become Mermaid subgraphs and Dot clusters.

export interface StructureNode {
  id: string;
  kind: "step" | "operation";
  /** What it shows: the step's name, an operation's code (first line). */
  label: string;
  /** The cluster (subworkflow call) it's in. */
  subworkflow: string | null;
}

export interface StructureGraph {
  nodes: StructureNode[];
  edges: Array<{ from: string; to: string }>;
  /** Subworkflows, drawn around their nodes. */
  clusters?: Array<{ id: string; name: string; parent: string | null }>;
}

const escapeLabel = (text: string, quote: string): string =>
  text.replace(/\\/g, "\\\\").replace(new RegExp(quote, "g"), `\\${quote}`);

/**
 * The lines of each cluster's block, nested: `open` starts a block, `node`
 * writes a node, `close` ends a block. Nodes outside any cluster come first.
 */
const nested = (
  graph: StructureGraph,
  indent: string,
  open: (cluster: { id: string; name: string }, index: number) => string,
  node: (node: StructureNode) => string,
  close: string,
): string[] => {
  const clusters = graph.clusters ?? [];
  const known = new Set(clusters.map((cluster) => cluster.id));
  const lines: string[] = [];
  const write = (parent: string | null, depth: number) => {
    const pad = indent.repeat(depth);
    for (const entry of graph.nodes)
      if ((known.has(entry.subworkflow ?? "") ? entry.subworkflow : null) === parent) lines.push(pad + node(entry));
    clusters.forEach((cluster, index) => {
      if (cluster.parent !== parent) return;
      lines.push(pad + open(cluster, index));
      write(cluster.id, depth + 1);
      lines.push(pad + close);
    });
  };
  write(null, 1);
  return lines;
};

/** As a Mermaid flowchart (left to right; operations rounded; subworkflows as subgraphs). */
export const toMermaid = (graph: StructureGraph): string => {
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `n${index + 1}`]));
  const label = (text: string) => `"${text.replace(/"/g, "#quot;")}"`;
  const lines = [
    "flowchart LR",
    ...nested(
      graph,
      "    ",
      (cluster, index) => `subgraph s${index + 1}[${label(cluster.name)}]`,
      (node) => (node.kind === "step" ? `${ids.get(node.id)}[${label(node.label)}]` : `${ids.get(node.id)}(${label(node.label)})`),
      "end",
    ),
  ];
  for (const { from, to } of graph.edges) {
    if (ids.has(from) && ids.has(to)) lines.push(`    ${ids.get(from)} --> ${ids.get(to)}`);
  }
  return `${lines.join("\n")}\n`;
};

/** As Graphviz Dot (steps as boxes, operations as ellipses, subworkflows as clusters). */
export const toDot = (graph: StructureGraph, name = "workflow"): string => {
  const lines = [
    `digraph "${escapeLabel(name, '"')}" {`,
    "    rankdir=LR;",
    ...nested(
      graph,
      "    ",
      (cluster, index) => `subgraph cluster_${index + 1} { label="${escapeLabel(cluster.name, '"')}";`,
      (node) =>
        `"${escapeLabel(node.id, '"')}" [label="${escapeLabel(node.label, '"')}", shape=${node.kind === "step" ? "box" : "ellipse"}];`,
      "}",
    ),
  ];
  for (const { from, to } of graph.edges) lines.push(`    "${escapeLabel(from, '"')}" -> "${escapeLabel(to, '"')}";`);
  lines.push("}");
  return `${lines.join("\n")}\n`;
};
