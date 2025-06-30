import type React from "react";
import { useState } from "react";
import { getBezierPath, EdgeLabelRenderer, BaseEdge } from "reactflow";
import type { EdgeProps } from "reactflow";

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
  data,
}) => {
  const [isHovered, setIsHovered] = useState(false);
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
    data.onDelete(id);
  };

  return (
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
            <button onClick={onEdgeClick} className="edge-delete-button">
              &times;
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
};

export default CustomEdge;
