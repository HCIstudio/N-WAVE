import type React from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";

import { SelectField, InputField } from "../../common";
import BaseOperatorPanel, {
  type InjectedOperatorProps,
} from "./BaseOperatorPanel";

interface MapPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const MapPanelContent: React.FC<InjectedOperatorProps> = ({
  nodeData = {},
  handleDataChange = () => {},
}) => {
  const {
    mapOperation = "changeCase",
    mapChangeCase = "toUpperCase",
    mapReplaceFind = "",
    mapReplaceWith = "",
  } = nodeData;

  return (
    <>
      <SelectField
        label="Transformation"
        id="mapOperation"
        name="mapOperation"
        value={mapOperation}
        onChange={(e) => handleDataChange("mapOperation", e.target.value)}
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
          onChange={(e) => handleDataChange("mapChangeCase", e.target.value)}
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
            onChange={(e) => handleDataChange("mapReplaceFind", e.target.value)}
            placeholder="Text to find"
          />
          <InputField
            label="Replace With"
            id="mapReplaceWith"
            name="mapReplaceWith"
            value={mapReplaceWith}
            onChange={(e) => handleDataChange("mapReplaceWith", e.target.value)}
            placeholder="Text to replace with"
          />
        </div>
      )}
    </>
  );
};

const MapPanel: React.FC<MapPanelProps> = ({ node, onSave }) => {
  return (
    <BaseOperatorPanel node={node} onSave={onSave} title="Map">
      <MapPanelContent />
    </BaseOperatorPanel>
  );
};

export default MapPanel;
