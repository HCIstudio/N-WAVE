import type { Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { getSamplesheetFileName } from "../registry/samplesheet";
import type { FileEncoding } from "./fileContent";

/** A file a workflow reads from its input directory. */
export interface WorkflowInputFile {
  name: string;
  /** File content; undefined when only the file name is known. */
  content?: string;
  /** "base64" for binary files; text otherwise. */
  encoding?: FileEncoding;
}

/**
 * The files a node puts into the workflow's input directory: uploads of a
 * File Input node, or the CSV of a Samplesheet node.
 */
export const getNodeInputFiles = (
  node: Node<NodeData>,
): WorkflowInputFile[] => {
  if (node.type === "samplesheet") {
    return [
      {
        name: getSamplesheetFileName(node.data),
        content:
          typeof node.data.samplesheet === "string"
            ? node.data.samplesheet
            : "",
      },
    ];
  }
  if (node.type !== "fileInput" || !Array.isArray(node.data.files)) return [];
  return node.data.files.flatMap((file) => {
    const name = file.name || file.originalName;
    if (!name) return [];
    return [
      {
        name,
        content: typeof file.content === "string" ? file.content : undefined,
        ...(file.encoding ? { encoding: file.encoding } : {}),
      },
    ];
  });
};

/**
 * Input files of all nodes, deduplicated by name (content wins). Throws when
 * two files share a name but not their content: the input directory is flat.
 */
export const getWorkflowInputFiles = (
  nodes: Node<NodeData>[],
): WorkflowInputFile[] => {
  const files = new Map<string, WorkflowInputFile>();
  for (const file of nodes.flatMap(getNodeInputFiles)) {
    const existing = files.get(file.name);
    if (
      existing?.content !== undefined &&
      file.content !== undefined &&
      existing.content !== file.content
    ) {
      throw new Error(
        `Two input files are named "${file.name}" but differ. Rename one of them (input files share one folder).`,
      );
    }
    if (!existing || existing.content === undefined) files.set(file.name, file);
  }
  return Array.from(files.values());
};
