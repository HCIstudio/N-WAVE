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
 * Whether an uploaded file's content is gone (larger files aren't kept after
 * a reload): it had bytes, but none are here. An empty file is complete.
 */
export const isFileContentMissing = (file: {
  content?: string;
  size?: number;
}): boolean => !file.content && (file.size ?? 1) > 0;

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
 * two files share a name but not their content (the input directory is
 * flat), differ only in case, or a name starts with "-".
 */
export const getWorkflowInputFiles = (
  nodes: Node<NodeData>[],
): WorkflowInputFile[] => {
  // By lowercased name: on macOS and Windows, Sample.fq and sample.fq are
  // the same file in the input folder.
  const files = new Map<string, WorkflowInputFile>();
  for (const file of nodes.flatMap(getNodeInputFiles)) {
    if (file.name.startsWith("-")) {
      throw new Error(
        `Rename "${file.name}": file names can't start with "-" (programs read them as options).`,
      );
    }
    const key = file.name.toLowerCase();
    const existing = files.get(key);
    if (existing && existing.name !== file.name) {
      throw new Error(
        `"${existing.name}" and "${file.name}" differ only in upper and lower case. Rename one of them (on macOS and Windows they are the same file).`,
      );
    }
    if (
      existing?.content !== undefined &&
      file.content !== undefined &&
      existing.content !== file.content
    ) {
      throw new Error(
        `Two input files are named "${file.name}" but differ. Rename one of them (input files share one folder).`,
      );
    }
    if (!existing || existing.content === undefined) files.set(key, file);
  }
  return Array.from(files.values());
};
