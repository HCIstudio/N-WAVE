import type React from "react";
import { useId } from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";

interface NotePanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

/** Edit a canvas note's text. */
const NotePanel: React.FC<NotePanelProps> = ({ node, onSave }) => {
  const fieldId = useId();
  return (
    <div className="space-y-2">
      <label
        htmlFor={`${fieldId}-text`}
        className="block text-xs font-medium text-text-light"
      >
        Note text
      </label>
      <textarea
        id={`${fieldId}-text`}
        value={typeof node.data.noteText === "string" ? node.data.noteText : ""}
        onChange={(event) => onSave(node.id, { noteText: event.target.value })}
        rows={10}
        className="w-full rounded-md border border-accent bg-background p-2 text-sm text-text focus:border-nextflow-green focus:ring-nextflow-green"
      />
      <p className="text-xs text-text-light">
        Notes explain a workflow to whoever opens it. They have no connections
        and add nothing to the generated code.
      </p>
    </div>
  );
};

export default NotePanel;
