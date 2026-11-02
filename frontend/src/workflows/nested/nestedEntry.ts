// Which canvas nodes have steps inside to show: an nf-core subworkflow node
// (its main.nf in nf-core/modules) and a Pipeline node (the pipeline's main.nf).

import type { Node } from "@xyflow/react";
import type { WorkflowSource } from "./nestedGraph";

export interface NestedEntry {
  source: WorkflowSource;
  /**
   * How Nextflow names the node's tasks before the step's own name: the
   * subworkflow's alias on the canvas. Unset for a pipeline, whose tasks
   * start with its top workflow (e.g. "NFCORE_RNASEQ").
   */
  path?: string[];
}

export const nestedEntryOf = (node: Pick<Node, "type" | "data">, alias: string): NestedEntry | null => {
  const data = (node.data ?? {}) as Record<string, unknown>;
  if (node.type === "pipeline") {
    const name = typeof data.pipelineName === "string" ? data.pipelineName : "";
    const version = typeof data.pipelineVersion === "string" ? data.pipelineVersion : "";
    return name && version ? { source: { type: "pipeline", name, version, path: "main.nf" } } : null;
  }
  const id = data.nwaveNfCoreModuleId;
  if (typeof id === "string" && id.startsWith("nf-core/subworkflows/")) {
    return { source: { type: "nfcore", id }, path: [alias] };
  }
  return null;
};
