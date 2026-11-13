// A lane around one arm of a branch (if / else if / else): the steps that run
// when the arm's condition holds (and none before it does). Drawn behind
// them; not part of the workflow.

import type { NodeProps } from "@xyflow/react";
import clsx from "clsx";
import type React from "react";
import { armStyle } from "../../branches/armStyles";
import type { BranchLaneData } from "../../canvas/canvasViews";

export const BranchLaneNode: React.FC<NodeProps> = ({ data }) => {
  const { arm, title, steps } = data as BranchLaneData;
  const style = armStyle(arm);
  return (
    <section
      aria-label={`Branch arm ${title}`}
      data-branch-lane={arm}
      className={clsx("pointer-events-none h-full w-full rounded-lg border-2 border-dashed", style.lane)}
    >
      <header
        title={`${steps.join(", ")}: ${title}`}
        className={clsx("pointer-events-auto truncate whitespace-nowrap px-2 text-[11px] font-medium leading-5", style.text)}
      >
        {title}
      </header>
    </section>
  );
};
