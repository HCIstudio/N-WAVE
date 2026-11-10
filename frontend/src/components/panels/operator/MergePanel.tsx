// The Merge operator's settings: the separator, and the merged file's type
// (from the incoming files' extensions).

import type { Node } from "@xyflow/react";
import type React from "react";
import { useEffect } from "react";
import { useOperatorPanel } from "../../../hooks";
import { InputField, OperatorHeader, SelectField } from "../../common";
import type { NodeData } from "../../nodes/BaseNode";

const MergePanel: React.FC<{
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}> = ({ node, onSave }) => {
  const { incomingFiles, handleDataChange: set } = useOperatorPanel(node, onSave);
  const { mergeOperation = "join", mergeJoinSeparator = "\\n" } = node.data;

  // The incoming files' extensions; the merged file has one of them.
  const extensions = [
    ...new Set(
      incomingFiles
        .map((file) => (file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : undefined))
        .filter((extension): extension is string => Boolean(extension)),
    ),
  ];
  const types = extensions.length > 0 ? extensions : ["txt"];
  const joinType = node.data.joinType && types.includes(node.data.joinType) ? node.data.joinType : types[0];

  // The generated code reads joinType: keep it one of the types offered.
  useEffect(() => {
    if (node.data.joinType !== joinType) set("joinType", joinType);
  }, [node.data.joinType, joinType, set]);

  return (
    <div className="space-y-3">
      <OperatorHeader title="Merge" />
      <SelectField
        label="Merge"
        id="mergeOperation"
        name="mergeOperation"
        value={mergeOperation}
        onChange={(e) => set("mergeOperation", e.target.value)}
      >
        <option value="join">Join Files</option>
      </SelectField>

      {mergeOperation === "join" && (
        <>
          <InputField
            label="Separator"
            id="mergeJoinSeparator"
            name="mergeJoinSeparator"
            value={mergeJoinSeparator}
            onChange={(e) => set("mergeJoinSeparator", e.target.value)}
            placeholder="e.g., , or \\n"
          />
          <SelectField
            label="Output Type"
            id="joinType"
            name="joinType"
            value={joinType}
            onChange={(e) => set("joinType", e.target.value)}
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </SelectField>
        </>
      )}
    </div>
  );
};

export default MergePanel;
