import type React from "react";
import clsx from "clsx";

/** The state a stacked node is in; the cards behind it take the same color. */
export type StackTone = "default" | "selected" | "error" | "warning" | "running" | "success" | "cached";

const TONES: Record<StackTone, string> = {
  default: "border-gray-400 bg-gray-100",
  selected: "border-nextflow-green bg-gray-100",
  error: "border-red-500 bg-red-50",
  warning: "border-yellow-500 bg-yellow-50",
  running: "border-yellow-400 bg-yellow-50",
  success: "border-green-500 bg-green-50",
  cached: "border-sky-500 bg-sky-50",
};

/**
 * Two cards behind a node, each 6px lower: the node holds several steps (a
 * subworkflow or a pipeline). They have the node's shape and its state's
 * color, so only their bottom edges show, evenly spaced.
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
          depth === 1 ? "translate-y-1.5" : "translate-y-3 brightness-95",
          TONES[tone],
        )}
      />
    ))}
  </>
);

export default NodeStack;
