import mongoose, { Document, Schema } from "mongoose";

// We can use Schema.Types.Mixed for flexible array elements like nodes and edges.
// For stricter typing, you could define sub-schemas for NodeData and EdgeData.

export interface IWorkflow extends Document {
  name?: string;
  description?: string;
  nodes: any[]; // Using any[] which translates to Mixed with Mongoose for flexibility
  edges: any[]; // Same as above
  executionSettings?: any; // Execution configuration settings
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
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps automatically
  }
);

const WorkflowModel = mongoose.model<IWorkflow>("Workflow", WorkflowSchema);

export default WorkflowModel;
