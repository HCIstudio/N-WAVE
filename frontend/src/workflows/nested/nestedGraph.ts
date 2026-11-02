// The nested view's graph: a workflow's steps laid out left to right in the
// order data flows, with each step's tasks from the run, and where to read
// a nested step's own main.nf.

import type { RunTask } from "../../api/runs";
import { summarizeTasks } from "../../execution/nodeRuns";
import { INPUT_NODE, OUTPUT_NODE, type WorkflowGraph, type WorkflowStep } from "./workflowGraph";

export const STEP_WIDTH = 220;
export const STEP_HEIGHT = 64;
const COLUMN_GAP = 90;
const ROW_GAP = 28;

export interface LaidOutStep {
  id: string;
  /** "input"/"output": the workflow's take: and emit:. */
  kind: WorkflowStep["kind"] | "input" | "output";
  position: { x: number; y: number };
  step?: WorkflowStep;
}

/** Columns by the longest path from the workflow's inputs; rows in call order. */
export const layoutGraph = (graph: WorkflowGraph): LaidOutStep[] => {
  const hasInput = graph.edges.some((edge) => edge.source === INPUT_NODE);
  const hasOutput = graph.edges.some((edge) => edge.target === OUTPUT_NODE);
  const ids = [
    ...(hasInput ? [INPUT_NODE] : []),
    ...graph.steps.map((step) => step.id),
    ...(hasOutput ? [OUTPUT_NODE] : []),
  ];
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of graph.edges) incoming.get(edge.target)?.push(edge.source);

  // Longest path; a loop (which Nextflow doesn't allow anyway) stops at itself.
  const column = new Map<string, number>();
  const visiting = new Set<string>();
  const columnOf = (id: string): number => {
    const known = column.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const sources = incoming.get(id) ?? [];
    const value =
      id === INPUT_NODE
        ? 0
        : sources.length === 0
          ? hasInput
            ? 1
            : 0
          : Math.max(...sources.map(columnOf)) + 1;
    visiting.delete(id);
    column.set(id, value);
    return value;
  };
  for (const id of ids) columnOf(id);
  // The outputs come last.
  if (hasOutput) {
    column.set(OUTPUT_NODE, Math.max(0, ...ids.filter((id) => id !== OUTPUT_NODE).map((id) => column.get(id) ?? 0)) + 1);
  }

  const rows = new Map<number, number>();
  const byStep = new Map(graph.steps.map((step) => [step.id, step]));
  return ids.map((id) => {
    const x = column.get(id) ?? 0;
    const y = rows.get(x) ?? 0;
    rows.set(x, y + 1);
    const step = byStep.get(id);
    return {
      id,
      kind: id === INPUT_NODE ? "input" : id === OUTPUT_NODE ? "output" : (step?.kind ?? "module"),
      position: { x: x * (STEP_WIDTH + COLUMN_GAP), y: y * (STEP_HEIGHT + ROW_GAP) },
      ...(step ? { step } : {}),
    };
  });
};

export type StepRun = ReturnType<typeof summarizeTasks>;

/**
 * A step's tasks: Nextflow names a task by the workflows it runs in, e.g.
 * "NFCORE_RNASEQ:RNASEQ:ALIGN_STAR:STAR_ALIGN". `path` is where the open
 * view is (["NFCORE_RNASEQ", "RNASEQ"]); a module's tasks are named
 * path + its name, a subworkflow's start with it.
 */
export const stepRun = (tasks: RunTask[], path: string[], step: WorkflowStep): StepRun | null => {
  const prefix = [...path, step.id];
  const mine = tasks.filter((task) => {
    const parts = task.process.split(":");
    if (prefix.some((part, index) => parts[index] !== part)) return false;
    return step.kind === "module" ? parts.length === prefix.length : parts.length > prefix.length;
  });
  return mine.length > 0 ? summarizeTasks(mine) : null;
};

/** Where a workflow's main.nf comes from. */
export type WorkflowSource =
  /** A file of an nf-core pipeline at a release, e.g. "workflows/rnaseq/main.nf". */
  | { type: "pipeline"; name: string; version: string; path: string }
  /** An nf-core subworkflow from nf-core/modules, e.g. "nf-core/subworkflows/fastq_align_hisat2". */
  | { type: "nfcore"; id: string };

/** "a/b/../c" → "a/c". */
const normalizePath = (path: string): string => {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
};

/** The file a step's include points at, or null for a module (nothing inside to show). */
export const nestedSource = (from: WorkflowSource, step: WorkflowStep): WorkflowSource | null => {
  if (step.kind === "module" || !step.include) return null;
  if (from.type === "pipeline") {
    const dir = from.path.split("/").slice(0, -1).join("/");
    // "…/align_star", "…/align_star/main" and "…/align_star/main.nf" are the same file.
    const target = normalizePath(`${dir}/${step.include}`).replace(/\/main(\.nf)?$/, "");
    return { ...from, path: target.endsWith(".nf") ? target : `${target}/main.nf` };
  }
  const name = from.id.replace(/^nf-core\/subworkflows\//, "");
  const target = normalizePath(`subworkflows/nf-core/${name}/${step.include}`).replace(/\/main(\.nf)?$/, "");
  const match = target.match(/^subworkflows\/nf-core\/([a-z0-9_]+)$/);
  return match ? { type: "nfcore", id: `nf-core/subworkflows/${match[1]}` } : null;
};
