import type React from "react";
import clsx from "clsx";

/** The state a stacked node is in; every card of the stack takes the same color. */
export type StackTone = "default" | "nfcore" | "selected" | "error" | "warning" | "running" | "success" | "cached";

/** The border every card of a stack has, the node itself included. */
export const STACK_BORDER: Record<StackTone, string> = {
  default: "border-gray-500",
  nfcore: "border-nextflow-green",
  selected: "border-nextflow-green",
  error: "border-red-500",
  warning: "border-yellow-500",
  running: "border-yellow-400",
  success: "border-green-500",
  cached: "border-sky-500",
};

const BACKGROUND: Record<StackTone, string> = {
  default: "bg-gray-100",
  nfcore: "bg-gray-100",
  selected: "bg-gray-100",
  error: "bg-red-50",
  warning: "bg-yellow-50",
  running: "bg-yellow-50",
  success: "bg-green-50",
  cached: "bg-sky-50",
};

/**
 * Two cards behind a node, each 6px further down and to the right: the node
 * holds several steps (a subworkflow or a pipeline). They have the node's
 * shape and the same 2px border in the same color as the node (give the
 * node `border-2` and STACK_BORDER[tone]), so the three edges are evenly
 * spaced.
 */
const NodeStack: React.FC<{ tone: StackTone }> = ({ tone }) => (
  <>
    {/* The deeper card first, so the nearer one is drawn over it. */}
    {[2, 1].map((depth) => (
      <div
        key={depth}
        aria-hidden="true"
        data-testid={depth === 1 ? "node-stack" : undefined}
        data-tone={depth === 1 ? tone : undefined}
        className={clsx(
          "pointer-events-none absolute inset-0 -z-10 rounded-lg border-2",
          depth === 1 ? "translate-x-1.5 translate-y-1.5" : "translate-x-3 translate-y-3 brightness-95",
          STACK_BORDER[tone],
          BACKGROUND[tone],
        )}
      />
    ))}
  </>
);

export default NodeStack;
