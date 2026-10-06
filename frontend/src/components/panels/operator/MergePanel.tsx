import type React from "react";
import { useState, useEffect } from "react";
import { useLatestRef } from "../../../hooks";
import type { Node as RFNode } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";
import { useReactFlow } from "reactflow";

import { SelectField, InputField } from "../../common";
import BaseOperatorPanel, {
  type InjectedOperatorProps,
} from "./BaseOperatorPanel";

interface MergePanelProps {
  node: RFNode<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const MergePanelContent: React.FC<InjectedOperatorProps> = ({
  nodeData = {},
  handleDataChange = () => {},
  node,
}) => {
  const { mergeOperation = "join", mergeJoinSeparator = "\\n" } = nodeData;
  const [joinType, setJoinType] = useState(nodeData.joinType || "txt");
  const { getEdges, getNodes } = useReactFlow();

  const [availableTypes, setAvailableTypes] = useState<string[]>([]);

  useEffect(() => {
    const edges = getEdges();
    const nodes = getNodes();

    const upstreamEdges = edges.filter((e) => e.target === (node?.id || ""));
    const exts = new Set<string>();

    for (const edge of upstreamEdges) {
      const srcNode = nodes.find((n) => n.id === edge.source);
      if (!srcNode) continue;

      const files =
        (srcNode.data as any)?.files ||
        (srcNode.data as any)?.selectedFiles ||
        (srcNode.data as any)?.filteredFiles ||
        (srcNode.data as any)?.mappedFiles ||
        (srcNode.data as any)?.joinedFiles ||
        [];

      for (const f of files) {
        const fname: string = f.name || f.originalName || "";
        const ext = fname.split(".").pop();
        if (ext) exts.add(ext.toLowerCase());
      }
    }

    if (exts.size > 0) {
      setAvailableTypes(Array.from(exts));
      // Reset joinType if the current selection is no longer available.
      const first = Array.from(exts)[0];
      setJoinType((current: string) => (exts.has(current) ? current : first));
    }
  }, [getEdges, getNodes, node?.id]);

  // handleDataChange may get a new identity on every render; only a changed
  // joinType should be saved.
  const handleDataChangeRef = useLatestRef(handleDataChange);
  useEffect(() => {
    handleDataChangeRef.current("joinType", joinType);
  }, [joinType, handleDataChangeRef]);

  return (
    <>
      <SelectField
        label="Merge"
        id="mergeOperation"
        name="mergeOperation"
        value={mergeOperation}
        onChange={(e) => handleDataChange("mergeOperation", e.target.value)}
      >
        <option value="join">Join Files</option>
      </SelectField>

      {mergeOperation === "join" && (
        <InputField
          label="Separator"
          id="mergeJoinSeparator"
          name="mergeJoinSeparator"
          value={mergeJoinSeparator}
          onChange={(e) =>
            handleDataChange("mergeJoinSeparator", e.target.value)
          }
          placeholder="e.g., , or \\n"
        />
      )}

      {mergeOperation === "join" && (
        <SelectField
          label="Output Type"
          id="joinType"
          name="joinType"
          value={joinType}
          onChange={(e) => setJoinType(e.target.value)}
        >
          {(availableTypes.length === 0 ? ["txt"] : availableTypes).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectField>
      )}
    </>
  );
};

const MergePanel: React.FC<MergePanelProps> = ({ node, onSave }) => {
  return (
    <BaseOperatorPanel node={node} onSave={onSave} title="Merge">
      <MergePanelContent />
    </BaseOperatorPanel>
  );
};

export default MergePanel;
