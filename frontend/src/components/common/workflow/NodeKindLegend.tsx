import type React from "react";
import { NODE_KIND_ORDER, NODE_KINDS, type NodeKind } from "../../../workflows/nodeKinds";

/** A node kind's mark, drawn as in the workflow previews. */
export const NodeKindSwatch: React.FC<{ kind: NodeKind }> = ({ kind }) => {
  const { color, shape } = NODE_KINDS[kind];
  return (
    <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0" aria-hidden="true">
      <rect
        x={1}
        y={1}
        width={14}
        height={8}
        rx={shape === "pill" ? 4 : 1.5}
        fill={shape === "outline" ? "none" : color}
        stroke={color}
        strokeWidth={shape === "outline" ? 1.5 : 0}
      />
    </svg>
  );
};

/** What the node colors and shapes mean. */
const NodeKindLegend: React.FC<{ className?: string }> = ({ className = "" }) => (
  <ul aria-label="Node kinds" className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-light ${className}`}>
    {NODE_KIND_ORDER.map((kind) => (
      <li key={kind} className="flex items-center gap-1.5" title={NODE_KINDS[kind].description}>
        <NodeKindSwatch kind={kind} />
        {NODE_KINDS[kind].label}
      </li>
    ))}
  </ul>
);

export default NodeKindLegend;
