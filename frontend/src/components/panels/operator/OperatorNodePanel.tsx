import type React from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";
import { getNodeDefinitionByOperatorType } from "../../../registry";

interface OperatorNodePanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

const OperatorNodePanel: React.FC<OperatorNodePanelProps> = ({
  node,
  onSave,
}) => {
  // Handle backward compatibility: old filter nodes had type: "filter"
  // New nodes have type: "operator" with operatorType field
  const operatorType =
    node.type === "filter" ? "filter" : node.data.operatorType;
  const PanelComponent = operatorType
    ? getNodeDefinitionByOperatorType(operatorType)?.panel
    : undefined;

  const renderOperatorContent = () => {
    if (PanelComponent) {
      return <PanelComponent node={node} onSave={onSave} />;
    }

    return (
      <p className="text-xs text-text-light text-center py-2">
        Unknown operator type: {operatorType || "undefined"}
        <br />
        Node type: {node.type}
        <br />
        Data operatorType: {node.data.operatorType || "undefined"}
      </p>
    );
  };

  return <div className="space-y-6">{renderOperatorContent()}</div>;
};

export default OperatorNodePanel;
