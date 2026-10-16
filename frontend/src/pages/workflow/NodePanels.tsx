import type React from "react";
import type { Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import {
  FloatingPanel,
  OutputDisplayPanelContent,
  PropertiesPanel,
} from "../../components/panels";
import { LastRunSection } from "../../components/panels/base/NodeRunResults";
import type { useNodePanels } from "./useNodePanels";

interface NodePanelsProps {
  nodes: Node<NodeData>[];
  panels: ReturnType<typeof useNodePanels>;
  /** True while a run locks the workflow: settings show but can't change. */
  locked: boolean;
  onNodeDataChange: (nodeId: string, data: Partial<NodeData>) => void;
  onDeleteNode: (node: Node<NodeData>) => void;
  onConvertToCustom: (node: Node<NodeData>, moduleSource?: string) => Promise<void>;
  onEditCustomNode: (customNodeId: string) => void;
}

/** The open node panels: Display nodes get a floating panel, others a properties panel. */
const NodePanels: React.FC<NodePanelsProps> = ({
  nodes,
  panels,
  locked,
  onNodeDataChange,
  onDeleteNode,
  onConvertToCustom,
  onEditCustomNode,
}) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const openNodes = panels.openIds
    .map((id) => byId.get(id))
    .filter((node): node is Node<NodeData> => Boolean(node));

  return (
    <>
      {openNodes.map((node) => {
        const shared = {
          onClose: () => panels.close(node.id),
          onMouseEnter: () => panels.setHighlightedId(node.id),
          onMouseLeave: () => panels.setHighlightedId(null),
          onFocus: () => panels.bringToFront(node.id),
          style: { zIndex: panels.zIndexOf(node.id) },
          recenterTrigger: panels.recenterTriggerOf(node.id),
        };

        if (node.type === "outputDisplay" || node.type === "documentation") {
          return (
            <FloatingPanel
              key={node.id}
              panelId={node.id}
              title={node.data.label || "Panel"}
              isOpen={panels.isInStack(node.id)}
              onDelete={() => onDeleteNode(node)}
              {...shared}
            >
              {node.type === "outputDisplay" ? (
                <div className="flex h-full flex-col gap-4">
                  <LastRunSection nodeId={node.id} />
                  <fieldset disabled={locked} className="min-w-0">
                    <OutputDisplayPanelContent
                      node={node}
                      onNodeDataChange={onNodeDataChange}
                    />
                  </fieldset>
                </div>
              ) : null}
            </FloatingPanel>
          );
        }
        return (
          <PropertiesPanel
            key={node.id}
            node={node}
            locked={locked}
            onSave={onNodeDataChange}
            onDelete={() => {
              onDeleteNode(node);
              panels.close(node.id);
            }}
            onConvertToCustom={onConvertToCustom}
            onEditCustomNode={onEditCustomNode}
            {...shared}
          />
        );
      })}
    </>
  );
};

export default NodePanels;
