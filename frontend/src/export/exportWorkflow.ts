import type { Node } from "reactflow";
import { getNfCoreModuleFiles } from "../api/nfcore";
import type { NodeData } from "../components/nodes/BaseNode";
import {
  buildProjectFiles,
  extractNextflowConfig,
  getReferencedNfCoreModules,
  type ProjectInputFile,
  toProjectName,
  zipProject,
} from "./exportProject";

/** Input files of the workflow's File Input nodes, deduplicated by name. */
export const collectInputFiles = (
  nodes: Node<NodeData>[],
): ProjectInputFile[] => {
  const files = new Map<string, ProjectInputFile>();
  for (const node of nodes) {
    if (node.type !== "fileInput" || !Array.isArray(node.data.files)) continue;
    for (const file of node.data.files) {
      const name = file.name || file.originalName;
      if (!name) continue;
      const existing = files.get(name);
      if (!existing || existing.content === undefined) {
        files.set(name, {
          name,
          content: typeof file.content === "string" ? file.content : undefined,
        });
      }
    }
  }
  return Array.from(files.values());
};

/**
 * Build the project zip for a workflow: fetches the nf-core module files the
 * script includes (from the backend, or from GitHub in the demo).
 */
export const exportWorkflowProject = async ({
  workflowName,
  script,
  nodes,
  nextflowVersion,
}: {
  workflowName: string;
  script: string;
  nodes: Node<NodeData>[];
  nextflowVersion?: string;
}): Promise<{ fileName: string; blob: Blob }> => {
  const modules = getReferencedNfCoreModules(
    extractNextflowConfig(script).script,
  );
  const moduleFiles = Object.fromEntries(
    await Promise.all(
      modules.map(async (module) => {
        try {
          return [module, await getNfCoreModuleFiles(`nf-core/${module}`)];
        } catch (error: unknown) {
          throw new Error(
            `Could not get the files of nf-core module ${module}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    ),
  );

  const files = buildProjectFiles({
    workflowName,
    script,
    inputFiles: collectInputFiles(nodes),
    moduleFiles,
    nextflowVersion,
  });
  return {
    fileName: `${toProjectName(workflowName)}.zip`,
    blob: await zipProject(workflowName, files),
  };
};
