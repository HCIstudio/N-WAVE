import fs from "node:fs";
import path from "node:path";
import { defaultExecutionSettings } from "../defaultExecutionSettings";
import { materializeWorkflow } from "../materializeWorkflow";
import type { WorkflowDescriptor, WorkflowEdge, WorkflowNode } from "../types";

// Built-in example workflows stored as JSON in assets/. The browser demo has
// the same files (frontend/src/demo), kept identical by frontend tests.

export interface JsonExampleDefinition {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  resources: { maxCpus: number; maxMemory: string };
}

const resolveAssetPath = (assetName: string): string => {
  const candidates = [
    path.join(__dirname, "assets", assetName),
    path.join(process.cwd(), "dist", "workflows", "library", "assets", assetName),
    path.join(process.cwd(), "src", "workflows", "library", "assets", assetName),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Example workflow asset not found: ${assetName}`);
  return found;
};

/** Load an example once; the factory returns its read-only descriptor. */
export const loadJsonExample = (
  assetName: string,
  sourceKey: string
): { id: string; getDescriptor: () => WorkflowDescriptor } => {
  const definition = JSON.parse(
    fs.readFileSync(resolveAssetPath(assetName), "utf-8")
  ) as JsonExampleDefinition;
  return {
    id: definition.id,
    getDescriptor: () =>
      materializeWorkflow({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        nodes: definition.nodes,
        edges: definition.edges,
        executionSettings: {
          ...defaultExecutionSettings,
          resources: {
            ...defaultExecutionSettings.resources,
            ...definition.resources,
          },
        },
        sourceType: "builtin",
        sourceFormat: "visual",
        sourceKey,
        isReadOnly: true,
        isBuiltin: true,
      }),
  };
};
