import { memo, useEffect, useMemo } from "react";
import type { NodeProps } from "reactflow";
import { useEdges, useNodes } from "reactflow";
import BaseNode, { type NodeData } from "./BaseNode";
import { useWorkflowContext } from "../../context/WorkflowContext";
import { isOperatorTypeRegistered } from "../../hooks";

const getNodeLabel = (nodeData: NodeData, fallback: string): string =>
  nodeData.label || nodeData.processType || nodeData.operatorType || fallback;

const OutputDisplayNode = (props: NodeProps<NodeData>) => {
  const { data, id } = props;
  const { updateNodeData } = useWorkflowContext();

  const edges = useEdges();
  const nodes = useNodes<NodeData>();

  // Find preview content from the connected parent node, if that parent provides any.
  const upstreamPreview = useMemo(() => {
    const parentEdge = edges.find((edge) => edge.target === id);
    if (!parentEdge) {
      return {
        files: null,
        previewUnavailable: false,
        previewUnavailableReason: undefined,
      };
    }

    const parentNode = nodes.find((node) => node.id === parentEdge.source);
    if (!parentNode) {
      return {
        files: null,
        previewUnavailable: false,
        previewUnavailableReason: undefined,
      };
    }

    if (Array.isArray(parentNode.data.files)) {
      return {
        files: parentNode.data.files,
        previewUnavailable: false,
        previewUnavailableReason: undefined,
      };
    }

    const operatorType =
      parentNode.type === "filter" ? "filter" : parentNode.data.operatorType;
    const hasOperatorPreview =
      parentNode.type === "operator" &&
      operatorType &&
      isOperatorTypeRegistered(operatorType);

    if (parentNode.type === "fileInput" || hasOperatorPreview) {
      return {
        files: [],
        previewUnavailable: false,
        previewUnavailableReason: undefined,
      };
    }

    const label = getNodeLabel(parentNode.data, parentNode.type || "node");
    return {
      files: [],
      previewUnavailable: true,
      previewUnavailableReason: `${label} does not provide browser preview output. Run the workflow to produce real results.`,
    };
  }, [edges, nodes, id]);

  // Effect to update this node's data when the parent's content changes
  useEffect(() => {
    const incomingFiles = upstreamPreview.files;

    // Basic deep-ish comparison to avoid loops
    const hasChanged =
      JSON.stringify(incomingFiles) !== JSON.stringify(data.files);
    const previewStateChanged =
      upstreamPreview.previewUnavailable !== data.previewUnavailable ||
      upstreamPreview.previewUnavailableReason !== data.previewUnavailableReason;

    if (upstreamPreview.previewUnavailable) {
      if (hasChanged || previewStateChanged) {
        updateNodeData(id, {
          files: [],
          previewUnavailable: true,
          previewUnavailableReason: upstreamPreview.previewUnavailableReason,
        });
      }
    } else if (incomingFiles !== null) {
      if (hasChanged || previewStateChanged) {
        updateNodeData(id, {
          files: incomingFiles,
          previewUnavailable: false,
          previewUnavailableReason: undefined,
        });
      }
    } else if (
      (data.files && data.files.length > 0) ||
      data.previewUnavailable
    ) {
      // Input has been disconnected, clear the files
      updateNodeData(id, {
        files: [],
        previewUnavailable: false,
        previewUnavailableReason: undefined,
      });
    }
  }, [
    id,
    upstreamPreview,
    data.files,
    data.previewUnavailable,
    data.previewUnavailableReason,
    updateNodeData,
  ]);

  const subtitle = data.previewUnavailable
    ? "Preview unavailable"
    : data.files && data.files.length > 0
    ? `${data.files.length} file${data.files.length !== 1 ? "s" : ""} received`
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
