// The canvas view in the bottom bar: the Editor (every node, editable), the
// Process graph (the steps only), or Groups (each group of steps as one box).
// All three are always shown; Groups is greyed out until the workflow has a
// group. N-WAVE draws each from the canvas (canvas/canvasViews.ts).

import clsx from "clsx";
import type React from "react";
import type { CanvasView } from "../../canvas/canvasViews";

export const VIEW_LABELS: Record<CanvasView, string> = {
  all: "Editor",
  steps: "Process graph",
  grouped: "Groups",
};

const VIEWS: Array<{ id: CanvasView; label: string; title: string }> = [
  { id: "all", label: VIEW_LABELS.all, title: "Every node, editable" },
  {
    id: "steps",
    label: VIEW_LABELS.steps,
    title:
      "The processes and how data flows between them; channel code hidden (read-only)",
  },
  {
    id: "grouped",
    label: VIEW_LABELS.grouped,
    title: "Each group of steps as one box: move, rename or ungroup groups",
  },
];

const CanvasViewSwitch: React.FC<{
  view: CanvasView;
  onChange: (view: CanvasView) => void;
  /** Groups can be opened once the workflow has a group. */
  hasGroups?: boolean;
}> = ({ view, onChange, hasGroups = false }) => (
  <fieldset
    aria-label="Canvas view"
    className="m-0 flex shrink-0 overflow-hidden rounded-md border border-panel-border p-0 text-xs"
  >
    {VIEWS.map((entry) => {
      const unavailable = entry.id === "grouped" && !hasGroups && view !== "grouped";
      return (
        <button
          key={entry.id}
          type="button"
          aria-pressed={view === entry.id}
          disabled={unavailable}
          title={
            unavailable
              ? "No groups yet: select steps in the Editor and choose Group into subworkflow… (or group a suggestion from Analyse)"
              : entry.title
          }
          onClick={() => onChange(entry.id)}
          className={clsx(
            "whitespace-nowrap px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40",
            view === entry.id
              ? "bg-accent font-medium text-text"
              : "text-text-light enabled:hover:text-text",
          )}
        >
          {entry.label}
        </button>
      );
    })}
  </fieldset>
);

export default CanvasViewSwitch;
