import type { Node } from "reactflow";
import { getNfCoreModuleFiles } from "../api/nfcore";
import type { NodeData } from "../components/nodes/BaseNode";
import { getWorkflowInputFiles } from "../utils/inputFiles";
import {
  buildProjectFiles,
  extractNextflowConfig,
  type ProjectInputFile,
  resolveNfCoreComponents,
  toProjectName,
  zipProject,
} from "./exportProject";

/** Input files of the workflow (File Input uploads, samplesheets). */
export const collectInputFiles = (
  nodes: Node<NodeData>[],
): ProjectInputFile[] => getWorkflowInputFiles(nodes);

/** Fetch the files of an nf-core module or subworkflow, naming it on failure. */
const fetchFiles = async (
  id: string,
  kind: string,
): Promise<Record<string, string>> => {
  try {
    return await getNfCoreModuleFiles(id);
  } catch (error: unknown) {
    throw new Error(
      `Could not get the files of nf-core ${kind} ${id.replace(/^nf-core\/(subworkflows\/)?/, "")}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

/**
 * Build the project zip for a workflow: fetches the nf-core module and
 * subworkflow files the script needs (from the backend, or from GitHub in
 * the demo), including what the subworkflows include.
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
  const workflowScript = extractNextflowConfig(script).script;

  // Subworkflows first: what they include decides which modules to fetch.
  const subworkflowFiles: Record<string, Record<string, string>> = {};
  for (;;) {
    const { unresolved } = resolveNfCoreComponents(
      workflowScript,
      (name) => subworkflowFiles[name]?.["main.nf"],
    );
    if (unresolved.length === 0) break;
    await Promise.all(
      unresolved.map(async (name) => {
        const files = await fetchFiles(
          `nf-core/subworkflows/${name}`,
          "subworkflow",
        );
        if (!files["main.nf"]) {
          throw new Error(`nf-core subworkflow ${name} has no main.nf.`);
        }
        subworkflowFiles[name] = files;
      }),
    );
  }
  const { modules } = resolveNfCoreComponents(
    workflowScript,
    (name) => subworkflowFiles[name]?.["main.nf"],
  );
  const moduleFiles = Object.fromEntries(
    await Promise.all(
      modules.map(
        async (module) =>
          [module, await fetchFiles(`nf-core/${module}`, "module")] as const,
      ),
    ),
  );

  const files = buildProjectFiles({
    workflowName,
    script,
    inputFiles: collectInputFiles(nodes),
    moduleFiles,
    subworkflowFiles,
    nextflowVersion,
  });
  return {
    fileName: `${toProjectName(workflowName)}.zip`,
    blob: await zipProject(workflowName, files),
  };
};
