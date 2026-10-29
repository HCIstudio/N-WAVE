// Whether a connection's ports fit: what the source output carries (files
// of a type, a folder, tool versions) against what the target input expects.
// Mismatches are hints, never blocks: a module's patterns aren't always
// complete, and advanced users may know better. Ports whose contents aren't
// known (most built-in steps, custom processes) are never flagged.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData, PortData } from "../components/nodes/BaseNode";
import { getNodeDefinitionForNode } from "./nodeDefinitions";
import { getNodeParameters } from "./params";

/** What a port carries or takes. */
export interface PortContents {
  kind: "file" | "directory" | "version";
  /** Glob patterns of the files, e.g. "*.{bam}". */
  patterns: string[];
  /** The concrete files, when they're known (uploads, parameters). */
  fileNames?: string[];
}

export interface ConnectionHint {
  message: string;
  fix: string;
}

const FASTQ = "*.{fastq,fq}{,.gz}";

/** Common inputs that nf-core modules leave without a pattern. */
const PATTERNS_BY_NAME: Array<[RegExp, string]> = [
  [/(^|_)fasta$/, "*.{fa,fasta,fna,fas,faa}{,.gz}"],
  [/^gtf$/, "*.gtf{,.gz}"],
  [/^gff$/, "*.{gff,gff3}{,.gz}"],
  [/^bam$/, "*.{bam,cram,sam}"],
  [/^vcf$/, "*.vcf{,.gz}"],
  [/^bed$/, "*.bed{,.gz}"],
  [/^fastq$/, FASTQ],
];

/** Readable names of common file types, by extension. */
const FORMATS: Array<[RegExp, string]> = [
  [/^(fastq|fq)$/, "FASTQ reads"],
  [/^(fa|fasta|fna|fas|faa)$/, "FASTA sequences"],
  [/^(bam|cram|sam)$/, "alignments (BAM/CRAM/SAM)"],
  [/^(gtf|gff|gff3)$/, "annotation (GTF/GFF)"],
  [/^bed$/, "BED regions"],
  [/^vcf$/, "VCF variants"],
  [/^(bai|crai|csi|fai)$/, "index files"],
  [/^html$/, "HTML reports"],
];

const definitionPort = (node: Node<NodeData>, handle: string, side: "inputs" | "outputs"): PortData | undefined =>
  getNodeDefinitionForNode(node)?.[side]?.find((port) => port.name === handle);

const baseName = (path: string): string => path.split("/").pop() ?? path;

/** A port's contents in a few words for its hover label, e.g. "*.{bam}" or "folder". */
export const portSummary = (
  node: Pick<Node<NodeData>, "type" | "data">,
  handle: string,
  side: "inputs" | "outputs",
): string | null => {
  const port = definitionPort(node as Node<NodeData>, handle, side);
  if (port?.kind === "directory") return "folder";
  if (port?.kind === "version") return "tool versions";
  return port?.filePattern ?? null;
};

/** What a node's output carries, or null when that isn't known. */
export const sourceContents = (node: Node<NodeData>, handle: string): PortContents | null => {
  if (node.type === "fileInput") {
    const names = (Array.isArray(node.data.files) ? node.data.files : [])
      .map((file) => file.name || file.originalName)
      .filter((name): name is string => Boolean(name));
    return names.length > 0 ? { kind: "file", patterns: [], fileNames: names } : null;
  }
  if (node.type === "samplesheet") return { kind: "file", patterns: [FASTQ] };
  if (node.type === "parameters") {
    const value = getNodeParameters(node.data).find((parameter) => parameter.name === handle)?.value?.trim();
    return value ? { kind: "file", patterns: [], fileNames: [baseName(value)] } : null;
  }
  const port = definitionPort(node, handle, "outputs");
  if (port?.kind === "version") return { kind: "version", patterns: ["versions.yml"] };
  if (port?.kind === "directory") return { kind: "directory", patterns: [] };
  if (port?.kind === "file" && port.filePattern) return { kind: "file", patterns: [baseName(port.filePattern)] };
  return null;
};

/** What a node's input takes, or null when anything may do. */
export const targetContents = (node: Node<NodeData>, handle: string): PortContents | null => {
  const port = definitionPort(node, handle, "inputs");
  if (port?.kind === "directory") return { kind: "directory", patterns: [] };
  if (port?.kind !== "file") return null;
  const pattern = port.filePattern ?? PATTERNS_BY_NAME.find(([name]) => name.test(handle))?.[1];
  return pattern ? { kind: "file", patterns: [baseName(pattern)] } : null;
};

/** `{a,b}` alternatives, expanded (at most a few dozen). */
const expandBraces = (pattern: string): string[] => {
  const match = pattern.match(/\{([^{}]*)\}/);
  if (!match || match.index === undefined) return [pattern];
  const before = pattern.slice(0, match.index);
  const after = pattern.slice(match.index + match[0].length);
  return match[1]
    .split(",")
    .flatMap((option) => expandBraces(`${before}${option}${after}`))
    .slice(0, 64);
};

const globToRegExp = (glob: string): RegExp =>
  new RegExp(
    `^(?:${expandBraces(glob)
      .map((option) => option.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."))
      .join("|")})$`,
    "i",
  );

/** Example file names a pattern stands for: "*.{bam}" gives "x.bam". */
const examples = (pattern: string): string[] =>
  expandBraces(pattern).map((option) => option.replace(/[*?]/g, "x"));

/** Whether a pattern says nothing about the file type ("*", "*.*"). */
const isVague = (pattern: string): boolean =>
  examples(pattern).every((name) => {
    const extension = name.includes(".") ? name.split(".").pop() : undefined;
    return !extension || extension === "x";
  });

/** File names as either side might give them, with or without ".gz". */
const variants = (name: string): string[] =>
  name.toLowerCase().endsWith(".gz") ? [name, name.slice(0, -3)] : [name, `${name}.gz`];

const fits = (names: string[], patterns: string[]): boolean => {
  const targets = patterns.map(globToRegExp);
  return names.some((name) => variants(name).some((variant) => targets.some((target) => target.test(variant))));
};

/** "FASTA sequences (*.fa, *.fasta)", from a pattern or file names. */
const describeContents = (contents: PortContents): string => {
  if (contents.kind === "directory") return "a folder (such as an index)";
  if (contents.kind === "version") return "tool versions";
  const names = contents.fileNames ?? contents.patterns.flatMap(examples);
  const extensions = [
    ...new Set(
      names
        .map((name) => name.toLowerCase().replace(/\.gz$/, "").split(".").pop() ?? "")
        .filter((extension) => extension && extension !== "x"),
    ),
  ];
  const format = extensions.length > 0 ? FORMATS.find(([test]) => extensions.every((extension) => test.test(extension)))?.[1] : undefined;
  const shown = contents.fileNames
    ? contents.fileNames.slice(0, 3).map((name) => `“${name}”`).join(", ")
    : contents.patterns.join(", ");
  return format ? `${format} (${shown})` : `files like ${shown}`;
};

const fixFor = (expected: PortContents, given: PortContents): string => {
  if (given.kind === "version") {
    return "Version outputs are for MultiQC's software versions report; connect one of the step's data outputs instead.";
  }
  if (expected.kind === "directory") {
    return "Connect the index output of the step that builds it (for example STAR genomegenerate's “index”).";
  }
  if (fits(examples(FASTQ), expected.patterns)) {
    return "Connect reads: a Samplesheet, a File Input with FASTQ files, or a step's reads output.";
  }
  return "Connect a matching file: a reference from a Parameters node or a File Input, or the step output that makes it.";
};

/** Why a connection's ports don't fit, or null when they do (or it's unknown). */
export const checkPortFit = (
  source: Node<NodeData>,
  sourceHandle: string,
  target: Node<NodeData>,
  targetHandle: string,
): ConnectionHint | null => {
  const given = sourceContents(source, sourceHandle);
  const expected = targetContents(target, targetHandle);
  if (!given || !expected) return null;

  let fitsTarget: boolean;
  if (expected.kind === "directory" || given.kind === "directory") {
    fitsTarget = expected.kind === given.kind;
  } else if (given.kind === "version") {
    fitsTarget = fits(["versions.yml"], expected.patterns);
  } else {
    const names = given.fileNames ?? given.patterns.filter((pattern) => !isVague(pattern)).flatMap(examples);
    if (names.length === 0 || expected.patterns.every(isVague)) return null;
    fitsTarget = fits(names, expected.patterns);
  }
  if (fitsTarget) return null;

  const targetLabel = String(target.data.label || target.type);
  const sourceLabel = String(source.data.label || source.type);
  return {
    message: `“${targetLabel}” expects ${describeContents(expected)} on “${targetHandle}”, but “${sourceLabel}” gives ${describeContents(given)}.`,
    fix: fixFor(expected, given),
  };
};

/** Hints for every connection that doesn't fit, by edge id. */
export const connectionHints = (nodes: Node<NodeData>[], edges: Edge[]): Record<string, ConnectionHint> => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const hints: Record<string, ConnectionHint> = {};
  for (const edge of edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target || !edge.sourceHandle || !edge.targetHandle) continue;
    const hint = checkPortFit(source, edge.sourceHandle, target, edge.targetHandle);
    if (hint) hints[edge.id] = hint;
  }
  return hints;
};
