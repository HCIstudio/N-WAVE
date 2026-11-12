// The canvas view in the bottom bar: the Editor (the workflow as built,
// editable), or one of two read-only graphs of its code, from
// BioFlow-Insight's analysis: the Specification graph (every process and
// channel operation) and the Process dependency graph (which process depends
// on which). Where the analysis can't run (the browser demo, switched off),
// the graphs are greyed out; opening one says why.

import clsx from "clsx";
import type React from "react";
import type { CanvasView } from "../../canvas/canvasViews";

const VIEWS: Array<{ id: CanvasView; label: string; title: string }> = [
  { id: "editor", label: "Editor", title: "The workflow as you build it: every node, editable" },
  {
    id: "specification",
    label: "Specification",
    title: "Specification graph (read-only): every process and channel operation in the code, and the channels between them",
  },
  {
    id: "dependencies",
    label: "Dependencies",
    title: "Process dependency graph (read-only): which process depends on which, and what a change affects",
  },
];

const CanvasViewSwitch: React.FC<{
  view: CanvasView;
  onChange: (view: CanvasView) => void;
  /** Why the graph views can't be shown here; they stay in the switch, greyed out. */
  graphsUnavailable?: string | null;
}> = ({ view, onChange, graphsUnavailable = null }) => (
  <fieldset
    aria-label="Canvas view"
    className="m-0 flex shrink-0 overflow-hidden rounded-md border border-panel-border p-0 text-xs"
  >
    {VIEWS.map((entry) => {
      const greyed = entry.id !== "editor" && graphsUnavailable !== null;
      return (
        <button
          key={entry.id}
          type="button"
          aria-pressed={view === entry.id}
          data-unavailable={greyed || undefined}
          title={greyed ? `${entry.title}. ${graphsUnavailable}` : entry.title}
          onClick={() => onChange(entry.id)}
          className={clsx(
            "whitespace-nowrap px-2 py-1",
            view === entry.id ? "bg-accent font-medium text-text" : "text-text-light hover:text-text",
            greyed && "opacity-40",
          )}
        >
          {entry.label}
          {greyed && <span className="sr-only"> (not available here)</span>}
        </button>
      );
    })}
  </fieldset>
);

export default CanvasViewSwitch;
