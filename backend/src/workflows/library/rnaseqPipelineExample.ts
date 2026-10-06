import fs from "node:fs";
import path from "node:path";
import { defaultExecutionSettings } from "../defaultExecutionSettings";
import { materializeWorkflow } from "../materializeWorkflow";
import type { WorkflowDescriptor, WorkflowEdge, WorkflowNode } from "../types";

// Built-in example: nf-core/rnaseq 3.27.0 as a Pipeline node, preset to the
// pipeline's test data, with notes on the canvas. The definition lives in
// assets/rnaseq_pipeline_example.json; the browser demo has the same one in
// frontend/src/demo/rnaseqExample.ts (a frontend test keeps them identical).

interface RnaseqExampleDefinition {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  resources: { maxCpus: number; maxMemory: string };
}

const ASSET_NAME = "rnaseq_pipeline_example.json";

const resolveAssetPath = (): string => {
  const candidates = [
    path.join(__dirname, "assets", ASSET_NAME),
    path.join(process.cwd(), "dist", "workflows", "library", "assets", ASSET_NAME),
    path.join(process.cwd(), "src", "workflows", "library", "assets", ASSET_NAME),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`Example workflow asset not found: ${ASSET_NAME}`);
  return found;
};

const definition = JSON.parse(
  fs.readFileSync(resolveAssetPath(), "utf-8")
) as RnaseqExampleDefinition;

export const rnaseqPipelineExampleId = definition.id;

export const getRnaseqPipelineExampleDescriptor = (): WorkflowDescriptor =>
  materializeWorkflow({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    nodes: definition.nodes,
    edges: definition.edges,
    executionSettings: {
      ...defaultExecutionSettings,
      resources: { ...defaultExecutionSettings.resources, ...definition.resources },
    },
    sourceType: "builtin",
    sourceFormat: "visual",
    sourceKey: "examples/rnaseq-pipeline",
    isReadOnly: true,
    isBuiltin: true,
  });
