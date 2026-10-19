import { createContext, useContext } from "react";

/** A problem the workflow check found on a node. */
export interface NodeProblem {
  level: "error" | "warning";
  message: string;
}

/** The workflow check's problems, by node ID. */
export const NodeProblemsContext = createContext<Record<string, NodeProblem[]>>({});

const NONE: NodeProblem[] = [];

/** What the workflow check found wrong with this node. */
export const useNodeProblems = (nodeId: string): NodeProblem[] =>
  useContext(NodeProblemsContext)[nodeId] ?? NONE;
