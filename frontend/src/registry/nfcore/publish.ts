import type { NodeData } from "../../components/nodes/BaseNode";

// Saving nf-core outputs: nf-core modules don't publish anything themselves
// (pipelines do it in their config), so each nf-core node copies its outputs
// to results/<folder>, the way nf-core pipelines lay out their results.

/** Whether the node saves its outputs (on unless turned off). */
export const savesOutputs = (data: NodeData): boolean =>
  data.nfcorePublish !== false;

/** The node's results folder: its label, lowercased, e.g. "star_alignment". */
export const resultsFolderFor = (data: NodeData, fallback: string): string =>
  String(data.label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback.toLowerCase();

/** `publishDir` lines for a process config block (versions.yml skipped). */
export const publishDirLines = (folder: string): string[] => [
  "  publishDir = [",
  `    path: { "\${params.outdir}/${folder}" },`,
  "    mode: 'copy',",
  "    saveAs: { filename -> filename.equals('versions.yml') ? null : filename }",
  "  ]",
];

/**
 * A subworkflow node's publish block (`withName: '<ALIAS>:.*' { publishDir
 * ... }`). It names the node's alias, so it doesn't apply to a copy.
 */
export const isSubworkflowPublishBlock = (block: string): boolean =>
  /^withName: '[A-Z0-9_]+:\.\*' \{\n {2}publishDir = \[/.test(block);
