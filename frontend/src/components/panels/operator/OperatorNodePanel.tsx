import type React from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../nodes/BaseNode";
import FilterPanel from "./FilterPanel";
import MapPanel from "./MapPanel";
import MergePanel from "./MergePanel";

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

  const renderOperatorContent = () => {
    switch (operatorType) {
      case "filter":
        return <FilterPanel node={node} onSave={onSave} />;
      case "map":
        return <MapPanel node={node} onSave={onSave} />;
      case "merge":
        return <MergePanel node={node} onSave={onSave} />;
      default:
        return (
          <p className="text-xs text-text-light text-center py-2">
            Unknown operator type: {operatorType || "undefined"}
            <br />
            Node type: {node.type}
            <br />
            Data operatorType: {node.data.operatorType || "undefined"}
          </p>
        );
    }
  };

  return <div className="space-y-6">{renderOperatorContent()}</div>;
};

export default OperatorNodePanel;
