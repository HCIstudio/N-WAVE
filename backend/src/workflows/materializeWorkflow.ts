import { defaultExecutionSettings } from "./defaultExecutionSettings";
import {
  MaterializeWorkflowInput,
  WorkflowDescriptor,
} from "./types";

export const materializeWorkflow = (
  input: MaterializeWorkflowInput
): WorkflowDescriptor => {
  const isReadOnly = input.isReadOnly ?? false;
  const isBuiltin = input.isBuiltin ?? input.sourceType === "builtin";

  return {
    _id: input.id,
    name: input.name,
    description: input.description ?? "",
    nodes: input.nodes ?? [],
    edges: input.edges ?? [],
    executionSettings: input.executionSettings ?? defaultExecutionSettings,
    rawSource: input.rawSource ?? null,
    importWarnings: input.importWarnings ?? [],
    isBuiltin,
    isReadOnly,
    origin: {
      type: input.sourceType,
      sourceFormat: input.sourceFormat,
      sourceKey: input.sourceKey ?? null,
      readOnly: isReadOnly,
      canDuplicate: true,
    },
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
};
