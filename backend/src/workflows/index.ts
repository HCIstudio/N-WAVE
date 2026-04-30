import { IWorkflow } from "../models/WorkflowModel";
import { materializeWorkflow } from "./materializeWorkflow";
import { getDemoWorkflowDescriptor, demoWorkflowId } from "./library/demoWorkflow";
import { WorkflowDescriptor } from "./types";

const builtinWorkflowFactories = [getDemoWorkflowDescriptor];

export const listBuiltinWorkflows = (): WorkflowDescriptor[] =>
  builtinWorkflowFactories.map((factory) => factory());

export const getBuiltinWorkflowById = (
  id: string
): WorkflowDescriptor | null =>
  listBuiltinWorkflows().find((workflow) => workflow._id === id) ?? null;

export const isBuiltinWorkflowId = (id: string): boolean => id === demoWorkflowId;

export const toWorkflowDescriptor = (workflow: IWorkflow): WorkflowDescriptor => {
  const workflowObject = workflow.toObject ? workflow.toObject() : workflow;

  return materializeWorkflow({
    id: String(workflowObject._id),
    name: workflowObject.name ?? "Untitled Workflow",
    description: workflowObject.description ?? "",
    nodes: workflowObject.nodes ?? [],
    edges: workflowObject.edges ?? [],
    executionSettings: workflowObject.executionSettings,
    rawSource: workflowObject.rawSource ?? null,
    importWarnings: workflowObject.importWarnings ?? [],
    sourceType: workflowObject.originType ?? "database",
    sourceFormat: workflowObject.sourceFormat ?? "visual",
    sourceKey: workflowObject.sourceKey ?? null,
    isReadOnly: workflowObject.isReadOnly ?? false,
    isBuiltin: workflowObject.isBuiltin ?? false,
    createdAt: workflowObject.createdAt,
    updatedAt: workflowObject.updatedAt,
  });
};
