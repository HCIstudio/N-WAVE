// The line while a connection is drawn: a branch's arm line dashed in its
// arm's color (it puts a step in the arm, no data flows), a data line as usual.

import { type ConnectionLineComponentProps, getBezierPath } from "@xyflow/react";
import type React from "react";
import { armStyle } from "../../branches/armStyles";

const ConnectionLine: React.FC<ConnectionLineComponentProps> = ({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  fromNode,
  fromHandle,
  connectionLineStyle,
}) => {
  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });
  if (fromNode?.type === "branch") {
    return (
      <path
        data-connection-line="arm"
        d={path}
        fill="none"
        stroke={armStyle(fromHandle?.id ?? "").line}
        strokeWidth={2.5}
        strokeDasharray="7 5"
      />
    );
  }
  return <path className="react-flow__connection-path" d={path} fill="none" style={connectionLineStyle} />;
};

export default ConnectionLine;
