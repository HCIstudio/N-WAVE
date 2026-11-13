// A line the canvas draws but nobody drew: a connection made in code, or
// steps connected through hidden channel code (the "Steps only" view).
// Dashed, and not editable.

import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import type React from "react";
import { useState } from "react";
import { armStyle } from "../../branches/armStyles";

const DerivedEdge: React.FC<EdgeProps> = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}) => {
  const [hovered, setHovered] = useState(false);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const kind = (data as { kind?: string } | undefined)?.kind;
  const inCode = kind === "code";
  const arm = (data as { arm?: string } | undefined)?.arm;
  const label = String((data as { label?: unknown } | undefined)?.label ?? "");
  // A branch's lines: to an arm's steps in the arm's color, from its parameters in violet.
  const stroke = kind === "branch" ? armStyle(arm ?? "if").line : kind === "branch-params" ? "#c026d3" : inCode ? "#d97706" : "#9ca3af";
  const dash = kind === "branch" ? "8 4" : kind === "branch-params" ? "3 3" : inCode ? "6 4" : "2 4";
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hovering only shows what the line is.
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-derived={kind === "branch" || kind === "branch-params" ? kind : inCode ? "code" : "through"}
    >
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeDasharray: dash,
          strokeWidth: kind === "branch" ? 2 : 1.5,
        }}
      />
      {hovered && label && (
        <EdgeLabelRenderer>
          <div
            role="note"
            style={{
              position: "absolute",
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 6}px)`,
              zIndex: 1001,
            }}
            className="nodrag nopan rounded border border-panel-border bg-panel-background px-2 py-0.5 text-xs text-text shadow"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
};

export default DerivedEdge;
