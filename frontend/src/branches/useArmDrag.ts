// While a line is drawn from a branch's arm exit: which branch and arm. Steps
// then light up the connection point on their top (where an arm's line goes)
// and grey out their data ports, which the line can't go to.

import { useConnection } from "@xyflow/react";

export interface ArmDrag {
  /** The Branch node's id. */
  branch: string;
  arm: string;
}

/** The arm whose line is being drawn, or null (no drag, or a data connection). */
export const useArmDrag = (): ArmDrag | null => {
  // A string, so nodes re-render only when a drag starts or ends, not on every pointer move.
  const key = useConnection((connection) =>
    connection.inProgress && connection.fromNode?.type === "branch" && connection.fromHandle?.type === "source"
      ? `${connection.fromNode.id}\n${connection.fromHandle.id ?? ""}`
      : "",
  );
  if (!key) return null;
  const [branch, arm = ""] = key.split("\n");
  return { branch, arm };
};
