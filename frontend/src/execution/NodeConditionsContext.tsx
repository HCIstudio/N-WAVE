import { createContext, useContext } from "react";
import type { NodeConditions } from "../analysis/conditions";

/** When each step runs (from the analysis), and whether it will with the current parameter values. */
export const NodeConditionsContext = createContext<Record<string, NodeConditions>>({});

export const useNodeConditions = (nodeId: string): NodeConditions | undefined =>
  useContext(NodeConditionsContext)[nodeId];
