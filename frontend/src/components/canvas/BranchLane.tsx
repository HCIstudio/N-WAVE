// A lane around one arm of a branch (if/else): the steps that run when its
// condition holds ("if"), or when it doesn't ("else"). Drawn behind them;
// not part of the workflow.

import type { NodeProps } from "@xyflow/react";
import clsx from "clsx";
import type React from "react";
import type { BranchLaneData } from "../../canvas/canvasViews";
import { ARM_STYLES } from "../nodes/BranchNode";

export const BranchLaneNode: React.FC<NodeProps> = ({ data }) => {
  const { arm, condition, steps } = data as BranchLaneData;
  const style = ARM_STYLES[arm];
  const title = arm === "if" ? `if ${condition}` : `else (not ${condition})`;
  return (
    <section
      aria-label={`Branch arm ${title}`}
      data-branch-lane={arm}
      className={clsx("pointer-events-none h-full w-full rounded-lg border-2 border-dashed", style.lane)}
    >
      <header
        title={`${steps.join(", ")} ${steps.length === 1 ? "runs" : "run"} ${arm === "if" ? "when" : "unless"} ${condition}`}
        className={clsx(
          "pointer-events-auto truncate whitespace-nowrap px-2 text-[11px] font-medium leading-5",
          style.text,
        )}
      >
        {title}
      </header>
    </section>
  );
};
