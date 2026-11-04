// The canvas view in the bottom bar: All (editable) or Steps only.

import clsx from "clsx";
import type React from "react";
import type { CanvasView } from "../../canvas/canvasViews";

const VIEWS: Array<{ id: CanvasView; label: string; title: string }> = [
  { id: "all", label: "All", title: "Every node, editable" },
  {
    id: "steps",
    label: "Steps",
    title:
      "Steps only: channel code hidden, steps connected through it (read-only)",
  },
];

const CanvasViewSwitch: React.FC<{
  view: CanvasView;
  onChange: (view: CanvasView) => void;
}> = ({ view, onChange }) => (
  <fieldset
    aria-label="Canvas view"
    className="m-0 flex min-w-0 overflow-hidden rounded-md border border-panel-border p-0 text-xs"
  >
    {VIEWS.map((entry) => (
      <button
        key={entry.id}
        type="button"
        aria-pressed={view === entry.id}
        title={entry.title}
        onClick={() => onChange(entry.id)}
        className={clsx(
          "px-2 py-1",
          view === entry.id
            ? "bg-accent font-medium text-text"
            : "text-text-light hover:text-text",
        )}
      >
        {entry.label}
      </button>
    ))}
  </fieldset>
);

export default CanvasViewSwitch;
