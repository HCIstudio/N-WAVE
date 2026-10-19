import type React from "react";
import type { WorkflowEdge, WorkflowNode } from "../../../types/backend";
import { NODE_KINDS, nodeKindOf } from "../../../workflows/nodeKinds";

const DEFAULT_SIZE = { width: 120, height: 90 };

/** The workflow's nodes, without notes. */
export const countNodes = (nodes: WorkflowNode[]): number =>
  nodes.filter((node) => node.type !== "note").length;

/** A small drawing of the workflow's graph, for its card. */
const WorkflowPreview: React.FC<{
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}> = ({ nodes, edges }) => {
  const steps = nodes.filter((node) => nodeKindOf(node) && node.position);
  if (steps.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md bg-background text-xs text-text-light">
        No nodes yet
      </div>
    );
  }
  // The size React Flow measured: `measured` since React Flow 12, `width` and
  // `height` in workflows saved before.
  const box = (node: WorkflowNode) => ({
    x: node.position?.x ?? 0,
    y: node.position?.y ?? 0,
    width: node.measured?.width ?? node.width ?? DEFAULT_SIZE.width,
    height: node.measured?.height ?? node.height ?? DEFAULT_SIZE.height,
  });
  const boxes = new Map(steps.map((node) => [node.id, box(node)]));
  const all = [...boxes.values()];
  const pad = 40;
  const minX = Math.min(...all.map((b) => b.x)) - pad;
  const minY = Math.min(...all.map((b) => b.y)) - pad;
  const width = Math.max(...all.map((b) => b.x + b.width)) - minX + pad;
  const height = Math.max(...all.map((b) => b.y + b.height)) - minY + pad;

  return (
    <svg
      viewBox={`${minX} ${minY} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-24 w-full rounded-md bg-background"
      aria-hidden="true"
    >
      {edges.map((edge) => {
        const source = boxes.get(edge.source);
        const target = boxes.get(edge.target);
        if (!source || !target) return null;
        const x1 = source.x + source.width;
        const y1 = source.y + source.height / 2;
        const x2 = target.x;
        const y2 = target.y + target.height / 2;
        const bend = Math.max(40, Math.abs(x2 - x1) / 2);
        return (
          <path
            key={edge.id}
            d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="#6b7280"
            strokeWidth={Math.max(3, width / 300)}
          />
        );
      })}
      {steps.map((node) => {
        const b = boxes.get(node.id);
        const kind = nodeKindOf(node);
        if (!b || !kind) return null;
        const { color, shape } = NODE_KINDS[kind];
        const stroke = Math.max(6, width / 120);
        return (
          <rect
            key={node.id}
            data-kind={kind}
            x={b.x + (shape === "outline" ? stroke / 2 : 0)}
            y={b.y + (shape === "outline" ? stroke / 2 : 0)}
            width={b.width - (shape === "outline" ? stroke : 0)}
            height={b.height - (shape === "outline" ? stroke : 0)}
            rx={shape === "pill" ? b.height / 2 : 12}
            fill={shape === "outline" ? "none" : color}
            stroke={color}
            strokeWidth={shape === "outline" ? stroke : 0}
          />
        );
      })}
    </svg>
  );
};

export default WorkflowPreview;
