import type React from "react";
import { useState } from "react";
import { getBezierPath, EdgeLabelRenderer, BaseEdge, useReactFlow } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";

const CustomEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { deleteElements } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation();
    // As a change of the canvas, so a run lock or a read-only example
    // (which asks for a copy) applies, as to any other edit.
    void deleteElements({ edges: [{ id }] });
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hovering only reveals the delete button; edges are selected and deleted through React Flow too.
    <g
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Invisible, wider path for easier hovering */}
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} />
      {/* The visible edge */}
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />

      {isHovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <button type="button" onClick={onEdgeClick} className="edge-delete-button">
              &times;
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
};

export default CustomEdge;
