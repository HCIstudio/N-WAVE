import { useCallback } from "react";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { getOperatorHook, isOperatorTypeRegistered } from "./operatorRegistry";

/**
 * Generic hook that delegates to the appropriate operator hook based on the node's operator type
 */
export const useOperatorLogic = (
  incomingFiles: FileObject[],
  nodeData: NodeData,
  operatorType: string | null,
  onSave: (data: Partial<NodeData>) => void
) => {
  // Create a stable callback for saving data
  const handleSave = useCallback(
    (data: Partial<NodeData>) => {
      onSave(data);
    },
    [onSave]
  );

  // Only proceed if we have a valid operator type
  if (!operatorType || !isOperatorTypeRegistered(operatorType)) {
    return null;
  }

  // Get the appropriate hook for this operator type
  const operatorHook = getOperatorHook(operatorType);

  if (!operatorHook) {
    console.warn(`No hook found for operator type: ${operatorType}`);
    return null;
  }

  // Call the operator hook
  const result = operatorHook(incomingFiles, nodeData, handleSave);

  return result;
};
