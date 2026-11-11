import type React from "react";
import { useContext } from "react";
import { MiniMap, type Node } from "@xyflow/react";
import { RunTasksContext } from "../../execution/RunTasksContext";
import { NODE_KINDS, nodeKindOf } from "../../workflows/nodeKinds";

/** During and after a run: each step by what it did. */
export const RUN_STATUS_COLORS = {
  running: "#facc15",
  succeeded: "#16a34a",
  failed: "#ef4444",
  cached: "#0ea5e9",
} as const;
const NOT_RUN = "#d4d4d4";
const NOTE = "#fde68a";

/** A node's color on the minimap: by kind as in the legend, or by its run status. */
export const minimapColor = (
  node: Pick<Node, "id" | "type" | "data">,
  nodeRuns: Record<string, { status: keyof typeof RUN_STATUS_COLORS }>,
  showRun: boolean,
): string => {
  const kind = nodeKindOf(node);
  if (!kind) return NOTE;
  if (showRun && kind !== "input") {
    const run = nodeRuns[node.id];
    return run ? RUN_STATUS_COLORS[run.status] : NOT_RUN;
  }
  return NODE_KINDS[kind].color;
};

/** The minimap of the canvas: bottom left, just above the zoom buttons. */
const CanvasMinimap: React.FC = () => {
  const { runId, nodeRuns } = useContext(RunTasksContext);
  const showRun = Boolean(runId) && Object.keys(nodeRuns).length > 0;
  return (
    <MiniMap
      ariaLabel={showRun ? "Minimap, colored by what the last run did" : "Minimap, colored by node kind"}
      nodeColor={(node) => minimapColor(node, nodeRuns, showRun)}
      nodeStrokeWidth={2}
      pannable
      zoomable
      position="bottom-left"
      // On narrow windows the bottom bar moves up into its place.
      className="!bottom-14 !left-0 !m-4 !mb-0 !bg-background !border !border-accent max-[860px]:!hidden"
      maskColor="rgba(0, 0, 0, 0.35)"
    />
  );
};

export default CanvasMinimap;
