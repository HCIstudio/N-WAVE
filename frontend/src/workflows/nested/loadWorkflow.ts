// Reading the main.nf of a nested view: a pipeline's file through
// /api/pipelines/workflow-file, an nf-core subworkflow like the Code tab does.

import api from "../../api";
import { getNfCoreModuleSource } from "../../api/nfcore";
import type { WorkflowSource } from "./nestedGraph";
import { parseWorkflowGraph, type WorkflowGraph } from "./workflowGraph";

const loaded = new Map<string, Promise<WorkflowGraph>>();

const keyOf = (source: WorkflowSource): string =>
  source.type === "pipeline" ? `${source.name}@${source.version}/${source.path}` : source.id;

const readSource = async (source: WorkflowSource): Promise<string> => {
  if (source.type === "nfcore") return getNfCoreModuleSource(source.id);
  const query = new URLSearchParams({ name: source.name, version: source.version, path: source.path });
  return (await api.get<{ source: string }>(`/pipelines/workflow-file?${query}`)).data.source;
};

/** The steps of the workflow in that file (read once per session; a failure is tried again next time). */
export const loadWorkflowGraph = (source: WorkflowSource, workflowName?: string): Promise<WorkflowGraph> => {
  const key = `${keyOf(source)}#${workflowName ?? ""}`;
  let graph = loaded.get(key);
  if (!graph) {
    graph = readSource(source).then((text) => parseWorkflowGraph(text, workflowName));
    graph.catch(() => loaded.delete(key));
    loaded.set(key, graph);
  }
  return graph;
};

/** Tests: read the files again. */
export const forgetLoadedWorkflows = (): void => loaded.clear();
