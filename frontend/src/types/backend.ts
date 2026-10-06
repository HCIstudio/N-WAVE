// This file contains type definitions for objects coming from the backend API.
// It helps to decouple frontend type definitions from backend source code.

import type { Edge, Node } from "reactflow";
import type { NodeData } from "../components/nodes/BaseNode";
import type { ExecutionSettings } from "./execution";

/** Canvas graph as persisted by the backend (React Flow nodes and edges). */
export type WorkflowNode = Node<NodeData>;
export type WorkflowEdge = Edge;

export interface WorkflowOriginDescriptor {
  type: "database" | "builtin" | "imported";
  sourceFormat: "visual" | "nextflow";
  sourceKey?: string | null;
  readOnly: boolean;
  canDuplicate: boolean;
}

export interface WorkflowDescriptor {
  _id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  executionSettings?: ExecutionSettings | null;
  rawSource?: string | null;
  importWarnings?: string[];
  isBuiltin?: boolean;
  isReadOnly?: boolean;
  origin?: WorkflowOriginDescriptor;
}
