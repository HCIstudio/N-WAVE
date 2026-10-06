import mongoose, { type Document, Schema } from "mongoose";
import type { JsonObject, WorkflowEdge, WorkflowNode } from "../workflows/types";

// Nodes, edges and execution settings are stored as Schema.Types.Mixed: their
// shape is owned by the frontend. Request bodies are validated in
// src/validation/schemas.ts before they reach the model.

export interface IWorkflow extends Document {
  name?: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  executionSettings?: JsonObject | null;
  originType?: "database" | "builtin" | "imported";
  sourceFormat?: "visual" | "nextflow";
  sourceKey?: string | null;
  rawSource?: string | null;
  importWarnings?: string[];
  isBuiltin?: boolean;
  isReadOnly?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const WorkflowSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: false,
    },
    description: {
      type: String,
      required: false,
      default: "",
    },
    nodes: {
      type: [Schema.Types.Mixed], // Array of any type of object
      required: true,
      default: [],
    },
    edges: {
      type: [Schema.Types.Mixed], // Array of any type of object
      required: true,
      default: [],
    },
    executionSettings: {
      type: Schema.Types.Mixed, // Flexible object for execution configuration
      required: false,
      default: null,
    },
    originType: {
      type: String,
      required: false,
      default: "database",
    },
    sourceFormat: {
      type: String,
      required: false,
      default: "visual",
    },
    sourceKey: {
      type: String,
      required: false,
      default: null,
    },
    rawSource: {
      type: String,
      required: false,
      default: null,
    },
    importWarnings: {
      type: [String],
      required: false,
      default: [],
    },
    isBuiltin: {
      type: Boolean,
      required: false,
      default: false,
    },
    isReadOnly: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps automatically
  }
);

const WorkflowModel = mongoose.model<IWorkflow>("Workflow", WorkflowSchema);

export default WorkflowModel;
