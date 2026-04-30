// This file contains type definitions for objects coming from the backend API.
// It helps to decouple frontend type definitions from backend source code.

export interface IFile {
  _id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  tags: string[];
  createdAt: Date;
}

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
  executionSettings?: any;
  rawSource?: string | null;
  importWarnings?: string[];
  isBuiltin?: boolean;
  isReadOnly?: boolean;
  origin?: WorkflowOriginDescriptor;
}
