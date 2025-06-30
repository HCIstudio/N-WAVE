import { memo, useContext, useEffect, useMemo } from "react";
import type { NodeProps } from "reactflow";
import { useEdges, useNodes } from "reactflow";
import BaseNode, { type NodeData } from "./BaseNode";
import { WorkflowContext } from "../../context/WorkflowContext";

const OutputDisplayNode = (props: NodeProps<NodeData>) => {
  const { data, id } = props;
  const { updateNodeData } = useContext(WorkflowContext)!;

  const edges = useEdges();
  const nodes = useNodes<NodeData>();

  // Find the content from the connected parent node
  const incomingFiles = useMemo(() => {
    const parentEdge = edges.find((edge) => edge.target === id);
    if (!parentEdge) return null;
    const parentNode = nodes.find((node) => node.id === parentEdge.source);
    return parentNode?.data.files ?? null;
  }, [edges, nodes, id]);

  // Effect to update this node's data when the parent's content changes
  useEffect(() => {
    // Basic deep-ish comparison to avoid loops
    const hasChanged =
      JSON.stringify(incomingFiles) !== JSON.stringify(data.files);

    if (incomingFiles !== null) {
      if (hasChanged) {
        updateNodeData(id, { files: incomingFiles });
      }
    } else if (data.files && data.files.length > 0) {
      // Input has been disconnected, clear the files
      updateNodeData(id, { files: [] });
    }
  }, [id, incomingFiles, data.files, updateNodeData]);

  const subtitle =
    data.files && data.files.length > 0
      ? `${data.files.length} file${
          data.files.length !== 1 ? "s" : ""
        } received`
      : "No content to display";

  const nodeData = {
    ...data,
    icon: data.icon || "Eye",
    subtitle,
    inputs: [{ name: "in" }], // Ensure it always has an input port
  };

  return <BaseNode {...props} data={nodeData} />;
};

export default memo(OutputDisplayNode);
