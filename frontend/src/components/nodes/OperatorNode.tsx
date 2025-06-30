import { memo, useContext, useEffect, useMemo, useCallback } from "react";
import type { NodeProps } from "reactflow";
import { useEdges, useNodes } from "reactflow";
import BaseNode, { type NodeData } from "./BaseNode";
import { WorkflowContext } from "../../context/WorkflowContext";
import { useOperatorLogic } from "../../hooks";

const OperatorNode = (props: NodeProps<NodeData>) => {
  const { data, id } = props;
  const { updateNodeData } = useContext(WorkflowContext)!;
  const edges = useEdges();
  const nodes = useNodes<NodeData>();

  // Callback to save operator data
  const handleOperatorSave = useCallback(
    (operatorData: Partial<NodeData>) => {
      updateNodeData(id, operatorData);
    },
    [id, updateNodeData]
  );

  // Track incoming files to trigger updates when they change
  const incomingFiles = useMemo(() => {
    const parentEdge = edges.find((edge) => edge.target === id);
    if (!parentEdge) return [];
    const parentNode = nodes.find((n) => n.id === parentEdge.source);
    const files = parentNode?.data.files || [];

    return files;
  }, [edges, nodes, id]);

  // Use the appropriate operator hook based on the operator type
  const operatorType =
    data.operatorType || (props.type === "filter" ? "filter" : null);

  // Run operator logic to process files automatically using the registry
  useOperatorLogic(incomingFiles, data, operatorType, handleOperatorSave);

  useEffect(() => {
    updateNodeData(id, {
      inputs: [{ name: "in" }],
      outputs: [{ name: "out" }],
    });
  }, [id, updateNodeData]);

  // Set initial subtitle if it doesn't exist
  useEffect(() => {
    if (!data.subtitle && data.operatorType) {
      updateNodeData(id, {
        subtitle: `Operator: ${
          data.operatorType.charAt(0).toUpperCase() + data.operatorType.slice(1)
        }`,
      });
    }
  }, [data.subtitle, data.operatorType, id, updateNodeData]);

  // Update node when incoming files change (triggers visual refresh)
  useEffect(() => {
    const parentEdge = edges.find((edge) => edge.target === id);
    const isConnected = !!parentEdge;

    if (isConnected) {
      if (incomingFiles.length > 0) {
        // Check if files are missing content (reupload needed)
        const filesWithoutContent = incomingFiles.filter(
          (file) => !file.content || file.content.trim() === ""
        );

        const operatorName = data.operatorType
          ? data.operatorType.charAt(0).toUpperCase() +
            data.operatorType.slice(1)
          : "Operator";

        if (filesWithoutContent.length > 0) {
          // Files exist but missing content - need reupload
          updateNodeData(id, {
            subtitle: `Waiting for reupload`,
            lastUpdated: Date.now(),
          });
        } else {
          // Files have content - use subtitle from operator logic if available
          // Otherwise fall back to basic file count
          console.log(`🔍 OperatorNode ${id} checking subtitle:`, {
            currentSubtitle: data.subtitle,
            operatorName,
            incomingFilesCount: incomingFiles.length,
            selectedFilterFiles: data.selectedFilterFiles?.length || 0,
            operatorType,
          });

          // Only set fallback subtitle if:
          // 1. No subtitle exists, OR
          // 2. Subtitle is just the operator name (default), OR
          // 3. Subtitle is "Waiting for files" (not reupload - let operator logic handle reupload case)
          if (
            !data.subtitle ||
            data.subtitle === `${operatorName}` ||
            data.subtitle === `${operatorName}: Waiting for files`
          ) {
            const fileCount = incomingFiles.length;
            const isUnedited = operatorType === "filter" && !data.filterText;
            const uneditedStatus = isUnedited ? " (unedited)" : "";

            console.log(
              `⚠️ OperatorNode ${id} overriding subtitle with basic count:`,
              `${operatorName}: ${fileCount} file${
                fileCount === 1 ? "" : "s"
              }${uneditedStatus}`
            );

            updateNodeData(id, {
              subtitle: `${operatorName}: ${fileCount} file${
                fileCount === 1 ? "" : "s"
              }${uneditedStatus}`,
              lastUpdated: Date.now(),
            });
          } else {
            console.log(
              `✅ OperatorNode ${id} keeping existing subtitle:`,
              data.subtitle
            );
          }
          // If operator logic has already set a subtitle, don't override it
        }
      } else {
        // Connected but no files yet
        const operatorName = data.operatorType
          ? data.operatorType.charAt(0).toUpperCase() +
            data.operatorType.slice(1)
          : "Operator";

        updateNodeData(id, {
          subtitle: `${operatorName}: Waiting for files`,
          lastUpdated: Date.now(),
        });
      }
    } else {
      // Not connected - show default subtitle
      const operatorName = data.operatorType
        ? data.operatorType.charAt(0).toUpperCase() + data.operatorType.slice(1)
        : "Operator";

      updateNodeData(id, {
        subtitle: `${operatorName}`,
        lastUpdated: Date.now(),
      });
    }
  }, [incomingFiles, data.operatorType, id, updateNodeData, edges]);

  const nodeData = { ...data, icon: data.icon || "Function" };
  return <BaseNode {...props} data={nodeData} />;
};

export default memo(OperatorNode);
