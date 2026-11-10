// Diagrams of a workflow, for the Export dialog: the canvas as drawn, or the
// analysis's step and channel graphs, as Mermaid, Dot, SVG or PNG.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { layoutStructure, type StructureGraph, toDot, toMermaid } from "../analysis/structure";

export type DiagramFormat = "mermaid" | "dot" | "svg" | "png";

export const DIAGRAM_FORMATS: Array<{ format: DiagramFormat; label: string; extension: string; type: string }> = [
  { format: "mermaid", label: "Mermaid", extension: ".mmd", type: "text/plain" },
  { format: "dot", label: "Dot", extension: ".dot", type: "text/vnd.graphviz" },
  { format: "svg", label: "SVG", extension: ".svg", type: "image/svg+xml" },
  { format: "png", label: "PNG", extension: ".png", type: "image/png" },
];

export interface Diagram {
  graph: StructureGraph;
  /** Where each node is drawn (its top left corner). */
  positions: Map<string, { x: number; y: number }>;
}

/** Nodes that are no step of the workflow: notes, and the frames of groups. */
const isDrawn = (node: Node<NodeData>) => node.type !== "note" && !node.type?.startsWith("group");

/** The canvas as drawn: its nodes where they are, operators rounded. */
export const canvasDiagram = (nodes: Node<NodeData>[], edges: Edge[]): Diagram => {
  const drawn = nodes.filter(isDrawn);
  const ids = new Set(drawn.map((node) => node.id));
  return {
    graph: {
      nodes: drawn.map((node) => ({
        id: node.id,
        kind: node.type === "operator" || node.type === "channelOperator" ? "operation" : "step",
        label: String(node.data.label || node.type || node.id),
        subworkflow: null,
      })),
      // One arrow per pair of steps, however many of their ports connect.
      edges: [
        ...new Map(
          edges
            .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
            .map((edge) => [`${edge.source}\n${edge.target}`, { from: edge.source, to: edge.target }]),
        ).values(),
      ],
    },
    positions: new Map(drawn.map((node) => [node.id, node.position])),
  };
};

/** A graph without positions (the analysis's), laid out left to right. */
export const laidOutDiagram = (graph: StructureGraph): Diagram => ({
  graph,
  positions: new Map(layoutStructure(graph).map((step) => [step.id, step.position])),
});

const BOX = { width: 180, height: 48 };
const MARGIN = 24;

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const shorten = (text: string, length = 26) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/** An SVG drawing: boxes for steps, rounded boxes for operations, arrows between them. */
export const toSvg = ({ graph, positions }: Diagram): string => {
  const placed = graph.nodes.filter((node) => positions.has(node.id));
  const xs = placed.map((node) => positions.get(node.id)?.x ?? 0);
  const ys = placed.map((node) => positions.get(node.id)?.y ?? 0);
  const left = Math.min(0, ...xs) - MARGIN;
  const top = Math.min(0, ...ys) - MARGIN;
  const width = Math.max(0, ...xs) + BOX.width + MARGIN - left;
  const height = Math.max(0, ...ys) + BOX.height + MARGIN - top;
  const at = (id: string) => {
    const { x, y } = positions.get(id) ?? { x: 0, y: 0 };
    return { x: x - left, y: y - top };
  };

  const edges = graph.edges
    .filter(({ from, to }) => positions.has(from) && positions.has(to))
    .map(({ from, to }) => {
      const a = at(from);
      const b = at(to);
      const [x1, y1, x2, y2] = [a.x + BOX.width, a.y + BOX.height / 2, b.x, b.y + BOX.height / 2];
      const bend = Math.max(40, Math.abs(x2 - x1) / 2);
      return `  <path d="M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}" fill="none" stroke="#555" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    });
  const boxes = placed.map((node) => {
    const { x, y } = at(node.id);
    const rounded = node.kind === "operation" ? BOX.height / 2 : 6;
    return [
      `  <g><title>${escapeXml(node.label)}</title>`,
      `    <rect x="${x}" y="${y}" width="${BOX.width}" height="${BOX.height}" rx="${rounded}" fill="${node.kind === "operation" ? "#f2f7f5" : "#ffffff"}" stroke="#0dc09d" stroke-width="1.5"/>`,
      `    <text x="${x + BOX.width / 2}" y="${y + BOX.height / 2}" text-anchor="middle" dominant-baseline="central" font-family="Inter, Helvetica, Arial, sans-serif" font-size="13" fill="#1f2937">${escapeXml(shorten(node.label))}</text>`,
      "  </g>",
    ].join("\n");
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '  <defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#555"/></marker></defs>',
    `  <rect width="${width}" height="${height}" fill="#ffffff"/>`,
    ...edges,
    ...boxes,
    "</svg>",
    "",
  ].join("\n");
};

/** The SVG drawn into a PNG, at twice its size for sharp prints. */
export const svgToPng = (svg: string, scale = 2): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("This browser can't draw a PNG."));
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The PNG couldn't be made."))), "image/png");
    };
    image.onerror = () => reject(new Error("The diagram couldn't be drawn."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

/** The diagram as a file of the format. */
export const renderDiagram = async (diagram: Diagram, format: DiagramFormat, name: string): Promise<Blob> => {
  const type = DIAGRAM_FORMATS.find((entry) => entry.format === format)?.type ?? "text/plain";
  switch (format) {
    case "mermaid":
      return new Blob([toMermaid(diagram.graph)], { type });
    case "dot":
      return new Blob([toDot(diagram.graph, name)], { type });
    case "svg":
      return new Blob([toSvg(diagram)], { type });
    case "png":
      return svgToPng(toSvg(diagram));
  }
};
