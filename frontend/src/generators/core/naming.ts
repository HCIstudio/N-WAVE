// Names in the Nextflow N-WAVE writes: each step's process (or alias) is
// named after its label on the canvas, the way a person would name it
// ("FastQC raw" → FASTQC_RAW), and is unique in the workflow.

import type { Node } from "@xyflow/react";

/**
 * Names that would clash in the script. Nextflow is case-sensitive, so
 * upper-case names never clash with its keywords and operators (`map`).
 */
const RESERVED = new Set<string>([]);

/** "FastQC raw (2)" → "FASTQC_RAW_2"; "" when nothing usable is left. */
export const upperSnake = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

/** "Reference FASTA" → "reference_fasta". */
export const lowerSnake = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

const typeWord = (node: Node): string => {
  const data = node.data as Record<string, unknown>;
  const type = data.operatorType ?? node.type ?? "step";
  return typeof type === "string" ? type : "step";
};

/** The name a node's process would have on its own, before making it unique. */
export const baseProcessName = (node: Node): string => {
  const label = (node.data as { label?: unknown }).label;
  let name = upperSnake(typeof label === "string" ? label : "") || upperSnake(typeWord(node)) || "STEP";
  if (/^[0-9]/.test(name)) name = `STEP_${name}`;
  if (RESERVED.has(name)) name = `${name}_STEP`;
  return name;
};

/**
 * Every node's process name, unique in the workflow. Nodes are numbered in
 * the order they were added (their ids), so a name stays when others change.
 */
export const processNamesFor = (nodes: Node[]): Map<string, string> => {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  const ordered = [...nodes].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  for (const node of ordered) {
    const base = baseProcessName(node);
    let name = base;
    for (let count = 2; taken.has(name); count += 1) name = `${base}_${count}`;
    taken.add(name);
    names.set(node.id, name);
  }
  return names;
};

/** Unique lower-case channel names (`ch_reads`, `ch_reads_2`), for input nodes and the like. */
export const uniqueName = (base: string, taken: Set<string>): string => {
  let name = base;
  for (let count = 2; taken.has(name); count += 1) name = `${base}_${count}`;
  taken.add(name);
  return name;
};
