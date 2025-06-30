/**
 * Operator Registry System
 *
 * This registry allows for scalable addition of new operator types without modifying
 * the OperatorNode component. To add a new operator:
 *
 * 1. Create a new hook file (e.g., `useSortOperator.ts`)
 * 2. Import it here and add it to the operatorRegistry
 * 3. That's it! The OperatorNode will automatically use your new operator
 *
 * Example:
 * ```typescript
 * import { useSortOperator } from "./useSortOperator";
 *
 * const operatorRegistry: Record<string, OperatorHook> = {
 *   filter: useFilterOperator,
 *   map: useMapOperator,
 *   reduce: useReduceOperator,
 *   sort: useSortOperator,  // <-- Add your new operator here
 * };
 * ```
 */

import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { useFilterOperator } from "./useFilterOperator";
import { useMapOperator } from "./useMapOperator";
import { useMergeOperator } from "./useMergeOperator";

// Type for operator hook functions
type OperatorHook = (
  incomingFiles: FileObject[],
  nodeData: NodeData,
  onSave: (data: Partial<NodeData>) => void
) => any;

// Registry of operator types to their hooks
const operatorRegistry: Record<string, OperatorHook> = {
  filter: useFilterOperator,
  map: useMapOperator,
  merge: useMergeOperator,
};

// Function to get the appropriate hook for an operator type
export const getOperatorHook = (operatorType: string): OperatorHook | null => {
  return operatorRegistry[operatorType] || null;
};

// Function to register new operator hooks (for future extensibility)
export const registerOperatorHook = (
  operatorType: string,
  hook: OperatorHook
) => {
  operatorRegistry[operatorType] = hook;
};

// Get all registered operator types
export const getRegisteredOperatorTypes = (): string[] => {
  return Object.keys(operatorRegistry);
};

// Check if an operator type is registered
export const isOperatorTypeRegistered = (operatorType: string): boolean => {
  return operatorType in operatorRegistry;
};
