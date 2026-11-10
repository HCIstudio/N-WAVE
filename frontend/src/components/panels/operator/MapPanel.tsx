// The Map operator's settings: change each line's case, or replace text.

import type { Node } from "@xyflow/react";
import type React from "react";
import { useOperatorPanel } from "../../../hooks";
import { InputField, OperatorHeader, SelectField } from "../../common";
import type { NodeData } from "../../nodes/BaseNode";

const MapPanel: React.FC<{
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}> = ({ node, onSave }) => {
  const { handleDataChange: set } = useOperatorPanel(node, onSave);
  const { mapOperation = "changeCase", mapChangeCase = "toUpperCase", mapReplaceFind = "", mapReplaceWith = "" } =
    node.data;

  return (
    <div className="space-y-3">
      <OperatorHeader title="Map" />
      <SelectField
        label="Transformation"
        id="mapOperation"
        name="mapOperation"
        value={mapOperation}
        onChange={(e) => set("mapOperation", e.target.value)}
      >
        <option value="changeCase">Change Case</option>
        <option value="replaceText">Replace Text</option>
      </SelectField>

      {mapOperation === "changeCase" && (
        <SelectField
          label="Case"
          id="mapChangeCase"
          name="mapChangeCase"
          value={mapChangeCase}
          onChange={(e) => set("mapChangeCase", e.target.value)}
        >
          <option value="toUpperCase">Uppercase</option>
          <option value="toLowerCase">Lowercase</option>
        </SelectField>
      )}

      {mapOperation === "replaceText" && (
        <div className="space-y-2">
          <InputField
            label="Find"
            id="mapReplaceFind"
            name="mapReplaceFind"
            value={mapReplaceFind}
            onChange={(e) => set("mapReplaceFind", e.target.value)}
            placeholder="Text to find"
          />
          <InputField
            label="Replace With"
            id="mapReplaceWith"
            name="mapReplaceWith"
            value={mapReplaceWith}
            onChange={(e) => set("mapReplaceWith", e.target.value)}
            placeholder="Text to replace with"
          />
        </div>
      )}
    </div>
  );
};

export default MapPanel;
