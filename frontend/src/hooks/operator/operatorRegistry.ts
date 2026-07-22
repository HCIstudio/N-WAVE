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
import {
  getNodeDefinitionByOperatorType,
  getRegisteredOperatorTypes as getRegisteredOperatorTypesFromDefinitions,
} from "../../registry";

// Type for operator hook functions
type OperatorHook = (
  incomingFiles: FileObject[],
  nodeData: NodeData,
  onSave: (data: Partial<NodeData>) => void
) => any;

// Runtime overrides support incremental extension without changing node definitions.
const operatorRegistryOverrides: Record<string, OperatorHook> = {};

// Function to get the appropriate hook for an operator type
export const getOperatorHook = (operatorType: string): OperatorHook | null => {
  return (
    operatorRegistryOverrides[operatorType] ||
    (getNodeDefinitionByOperatorType(operatorType)?.previewHook as
      | OperatorHook
      | undefined) ||
    null
  );
};

// Function to register new operator hooks (for future extensibility)
export const registerOperatorHook = (
  operatorType: string,
  hook: OperatorHook
) => {
  operatorRegistryOverrides[operatorType] = hook;
};

// Get all registered operator types
export const getRegisteredOperatorTypes = (): string[] => {
  return [
    ...new Set([
      ...getRegisteredOperatorTypesFromDefinitions(),
      ...Object.keys(operatorRegistryOverrides),
    ]),
  ];
};

// Check if an operator type is registered
export const isOperatorTypeRegistered = (operatorType: string): boolean => {
  return !!getOperatorHook(operatorType);
};
