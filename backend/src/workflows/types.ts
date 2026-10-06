/** Arbitrary JSON object. React Flow nodes/edges are stored as-is. */
export type JsonObject = Record<string, unknown>;

/**
 * A React Flow node or edge as persisted by the frontend. Only the fields the
 * backend reads are named; everything else is passed through untouched.
 */
export type WorkflowNode = JsonObject;
export type WorkflowEdge = JsonObject;

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
  executionSettings: JsonObject | null;
  rawSource?: string | null;
  importWarnings?: string[];
  isBuiltin: boolean;
  isReadOnly: boolean;
  origin: WorkflowOriginDescriptor;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MaterializeWorkflowInput {
  id: string;
  name: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  executionSettings?: JsonObject | null;
  rawSource?: string | null;
  importWarnings?: string[];
  sourceType: "database" | "builtin" | "imported";
  sourceFormat: "visual" | "nextflow";
  sourceKey?: string | null;
  isReadOnly?: boolean;
  isBuiltin?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
