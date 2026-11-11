// How a group of steps (#221) looks on the canvas: a frame behind its steps
// in All, a box standing for them in Grouped. Neither is a step of its own.

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Layers } from "lucide-react";
import clsx from "clsx";
import type React from "react";
import { createContext, useContext } from "react";
import type { GroupNodeData } from "../../canvas/canvasViews";

export interface GroupActions {
  rename: (group: string) => void;
  ungroup: (group: string) => void;
  /** Its steps, in All. */
  open: (group: string) => void;
  /** Whether the workflow can be changed (not while it runs). */
  editable: boolean;
}

export const GroupActionsContext = createContext<GroupActions>({
  rename: () => {},
  ungroup: () => {},
  open: () => {},
  editable: false,
});

const stepCount = (steps: string[]) => `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;

/** The group's name; clicked, it opens the group's editor (name, ungroup). */
const GroupName: React.FC<{ group: string; title: string; className?: string }> = ({ group, title, className }) => {
  const actions = useContext(GroupActionsContext);
  if (!actions.editable) return <span className={clsx("font-semibold text-sky-300", className)}>{title}</span>;
  return (
    <button
      type="button"
      onClick={() => actions.rename(group)}
      aria-label={`Edit group “${title}”`}
      title="Rename or ungroup"
      className={clsx(
        "nodrag rounded px-1 font-semibold text-sky-300 underline decoration-dotted underline-offset-2 hover:bg-sky-500/15",
        className,
      )}
    >
      {title}
    </button>
  );
};

/** The frame around a group's steps; only its header takes clicks. */
export const GroupFrameNode: React.FC<NodeProps> = ({ data }) => {
  const { group, title, steps } = data as GroupNodeData;
  return (
    <section
      aria-label={`Group “${title}”`}
      data-group={group}
      className="pointer-events-none h-full w-full rounded-lg border-2 border-dashed border-sky-500/70 bg-sky-500/5"
    >
      <header
        title={`Subworkflow ${group} in the code`}
        className="pointer-events-auto flex items-center gap-2 whitespace-nowrap px-2 py-1 text-xs"
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden />
        <GroupName group={group} title={title} />
        <span className="truncate text-text-light">{stepCount(steps)}</span>
      </header>
    </section>
  );
};

/** A group as one box (Grouped view); double-click or Open shows its steps. */
export const GroupBoxNode: React.FC<NodeProps> = ({ data }) => {
  const { group, title, steps } = data as GroupNodeData;
  const actions = useContext(GroupActionsContext);
  return (
    <section
      aria-label={`Group “${title}”`}
      data-group={group}
      className="pointer-events-auto h-full w-full overflow-hidden rounded-lg border-2 border-sky-500 bg-panel-background p-3 text-text shadow"
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-sky-600" aria-hidden />
        <h3 className="text-sm">
          <GroupName group={group} title={title} />
        </h3>
      </div>
      <p className="mt-0.5 text-xs text-text-light">
        Subworkflow {group} · {stepCount(steps)}
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {steps.slice(0, 5).map((step) => (
          <li key={step} className="truncate">
            {step}
          </li>
        ))}
        {steps.length > 5 && <li className="text-text-light">and {steps.length - 5} more</li>}
      </ul>
      <button
        type="button"
        className="nodrag mt-2 rounded border border-panel-border px-2 py-0.5 text-xs hover:bg-accent"
        onClick={() => actions.open(group)}
      >
        Open
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </section>
  );
};
