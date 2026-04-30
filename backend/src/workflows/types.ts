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
  nodes: any[];
  edges: any[];
  executionSettings: any;
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
  nodes?: any[];
  edges?: any[];
  executionSettings?: any;
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
