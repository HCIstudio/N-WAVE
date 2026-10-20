import type React from "react";
import { useState } from "react";
import { getBezierPath, EdgeLabelRenderer, BaseEdge, useReactFlow } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { useConnectionHint } from "../../execution/ConnectionHintsContext";

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
  // Ports that don't fit: the connection stays, with a warning on it.
  const hint = useConnectionHint(id);
  const [showHint, setShowHint] = useState(false);
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
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={hint ? { ...style, stroke: "#f59e0b", strokeDasharray: "6 4" } : style}
      />

      {hint && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 10}px)`,
              pointerEvents: "all",
              // Above the nodes, so a connection running behind one keeps it reachable.
              zIndex: 1001,
            }}
            className="nodrag nopan flex flex-col items-center"
          >
            {showHint && (
              <div
                role="note"
                className="mb-1 w-64 rounded-md border border-yellow-500 bg-yellow-50 p-2 text-xs text-yellow-900 shadow-lg"
              >
                <p>{hint.message}</p>
                <p className="mt-1 font-medium">{hint.fix}</p>
              </div>
            )}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setShowHint((shown) => !shown);
              }}
              aria-label={`Connection warning: ${hint.message}`}
              aria-expanded={showHint}
              title={`${hint.message} ${hint.fix}`}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-yellow-500 bg-yellow-100 text-yellow-800 shadow-sm"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}

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
