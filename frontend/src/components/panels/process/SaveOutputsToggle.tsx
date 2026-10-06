import type React from "react";
import type { Node } from "reactflow";
import {
  resultsFolderFor,
  savesOutputs,
} from "../../../registry/nfcore/publish";
import type { NodeData } from "../../nodes/BaseNode";

/** "Save outputs to results/<folder>" for nf-core module and subworkflow nodes. */
const SaveOutputsToggle: React.FC<{
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}> = ({ node, onSave }) => (
  <label className="flex items-start gap-2 text-sm text-text">
    <input
      type="checkbox"
      className="mt-0.5"
      checked={savesOutputs(node.data)}
      onChange={(event) =>
        onSave(node.id, { nfcorePublish: event.target.checked })
      }
    />
    <span>
      Save outputs to{" "}
      <code className="text-xs">
        results/{resultsFolderFor(node.data, node.id)}
      </code>
      <span className="block text-xs text-text-light">
        The folder is named after the node; versions.yml is left out.
      </span>
    </span>
  </label>
);

export default SaveOutputsToggle;
