import { memo } from "react";
import type { NodeProps } from "reactflow";
import clsx from "clsx";
import type { NodeData } from "../BaseNode";

/**
 * A note on the canvas: guidance text for whoever opens the workflow. It
 * has no ports and adds nothing to the generated code.
 */
const NoteNode = ({ data, selected }: NodeProps<NodeData>) => (
  <div
    className={clsx(
      "w-72 rounded-md border bg-yellow-50 p-3 text-sm text-gray-800 shadow-md",
      selected || data.isHighlight
        ? "border-nextflow-green ring-2 ring-nextflow-green/50"
        : "border-yellow-300",
    )}
  >
    {data.label && data.label !== "Note" && (
      <p className="mb-1 font-semibold">{data.label}</p>
    )}
    <p className="whitespace-pre-line leading-snug">
      {typeof data.noteText === "string" && data.noteText.trim()
        ? data.noteText
        : "Double-click to write a note."}
    </p>
  </div>
);

export default memo(NoteNode);
