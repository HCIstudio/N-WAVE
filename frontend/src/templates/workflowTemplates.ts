// What a new workflow can start from, besides an editable copy of a built-in
// demo: an empty canvas or a small ready-made workflow. A template's nf-core
// nodes are installed from the prompt the canvas shows for missing components.

import type { WorkflowEdge, WorkflowNode } from "../types/backend";
import qcFastqTemplate from "./qcFastqTemplate.json";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const EMPTY_TEMPLATE: WorkflowTemplate = {
  id: "empty",
  name: "Empty workflow",
  description: "A blank canvas: add nodes from the node menu and connect them.",
  nodes: [],
  edges: [],
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  EMPTY_TEMPLATE,
  {
    id: "qc-fastq",
    name: qcFastqTemplate.name,
    description: qcFastqTemplate.description,
    nodes: qcFastqTemplate.nodes as unknown as WorkflowNode[],
    edges: qcFastqTemplate.edges as unknown as WorkflowEdge[],
  },
];
