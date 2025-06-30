import React from "react";
import type { Node } from "reactflow";
import type { NodeData, FileObject } from "../../nodes/BaseNode";
import { useOperatorPanel } from "../../../hooks";
import { OperatorHeader } from "../../common";

// Common interface for all operator panels
export interface BaseOperatorPanelProps {
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}

// Props that get injected into children components
export interface InjectedOperatorProps {
  nodeData?: NodeData;
  handleDataChange?: (field: keyof NodeData, value: any) => void;
  incomingFiles?: FileObject[];
  node?: Node<NodeData>;
  onSave?: (nodeId: string, data: Partial<NodeData>) => void;
}

// Base operator panel component that provides common structure and logic
interface BaseOperatorPanelWrapperProps extends BaseOperatorPanelProps {
  title: string;
  children: React.ReactElement<InjectedOperatorProps>;
  showFileSelection?: boolean;
}

const BaseOperatorPanel: React.FC<BaseOperatorPanelWrapperProps> = ({
  node,
  onSave,
  title,
  children,
  showFileSelection = false,
}) => {
  const { incomingFiles, handleDataChange } = useOperatorPanel(node, onSave);

  // Clone the child and inject the necessary props
  const childWithProps = React.cloneElement(children, {
    nodeData: node.data,
    handleDataChange,
    incomingFiles,
    node,
    onSave,
  });

  return (
    <div className="space-y-4">
      {showFileSelection && (
        <div className="space-y-2">
          <h3 className="text-md font-semibold text-text border-b border-accent pb-2">
            File Selection
          </h3>
          {incomingFiles.length > 0 ? (
            <p className="text-xs text-text-light text-center py-2">
              Processing {incomingFiles.length} file(s) from parent node.
            </p>
          ) : (
            <p className="text-xs text-text-light text-center py-2">
              No files received from parent node.
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <OperatorHeader title={title} />
        {childWithProps}
      </div>
    </div>
  );
};

// Export both the component and the hook for easy access
export { BaseOperatorPanel, useOperatorPanel };
export default BaseOperatorPanel;
