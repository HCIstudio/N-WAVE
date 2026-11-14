// A BottleMod model of a run (Lößer et al., ICPE '25): each canvas node that
// ran tasks becomes a BottleMod process, each connection a data dependency,
// with requirement functions fitted from N-WAVE's measurements of the run.
//
// - Progress of a step: 0 to 100 % of its tasks' work.
// - Resources (BottleMod's non-storable inputs):
//   - CPU: the CPU time its tasks used (realtime × %CPU), against the cores
//     the run had, less what steps earlier in the workflow use at the time
//     (the paper shares its link between two downloads the same way).
//   - Task slots: its tasks' time from start to end, against how many of
//     them can run at once with the run's CPUs and memory. This limits a
//     step whose tasks can't use more cores (one thread, waiting for I/O).
// - Data (storable inputs): the progress of the steps it gets data from.
//   A step with one task that takes all of an input (MultiQC) needs all of
//   it first (burst); a step with a task per sample goes on with each
//   (stream). The I/O monitor's records refine this where it ran.
//
// The model is an estimate: it is fitted to the run it came from, and its
// predicted runtime is shown next to the measured one.

import { lastOf, PPoly } from "./ppoly";

import { NeverFinishesError, Task, TaskExecution, func } from "./task";

export interface ModelStepInput {
  from: string;
  /** stream: progresses with the input; burst: needs all of it first. */
  kind: "stream" | "burst";
}

export interface ModelStep {
  id: string;
  label: string;
  tasks: number;
  /** CPU seconds its tasks used together. */
  cpuSeconds: number;
  /** Seconds its tasks ran, from start to end, together. */
  taskSeconds: number;
  /** What one task asked for. */
  cpusPerTask: number;
  memoryPerTask: number | null;
  /** The most one task used at once: CPUs (from %CPU). */
  cpuUsePerTask: number;
  inputs: ModelStepInput[];
  /** When it ran in the measured run (seconds from the run's start). */
  measured: { start: number; end: number };
}

export interface ModelResources {
  /** The CPUs the run's tasks share: how many run at once (the computer's, or a cluster's). */
  cpus: number;
  /** Bytes. */
  memory: number;
  /**
   * The most CPUs one step's task may ask for (N-WAVE's Maximum CPU Cores:
   * Nextflow's process.resourceLimits); unset, what the tasks asked for.
   */
  cpusPerTask?: number;
}

/** The CPUs a step's task reserves: what it asked for, capped by the run's limit. */
export const reservedCpus = (step: ModelStep, resources: ModelResources): number =>
  Math.max(1, Math.min(step.cpusPerTask, resources.cpusPerTask ?? Number.POSITIVE_INFINITY));

/** What limited a step in an interval: CPU time, the CPUs or memory its tasks reserve, or an input. */
export type Limit = { kind: "cpu" } | { kind: "slots" } | { kind: "memory" } | { kind: "input"; from: string };

export interface StepPrediction {
  id: string;
  /** Progress (0–100 %) over time (seconds from the run's start). */
  progress: PPoly;
  /** Per piece of `progress`: what limited it. */
  limits: Limit[];
  start: number;
  end: number;
  /** How many of its tasks can run at once. */
  slots: number;
}

export interface RunPrediction {
  steps: StepPrediction[];
  /** Seconds from the first step's start to the last one's end. */
  total: number;
}

/**
 * Steps in an order where each comes after the steps it gets data from;
 * `first` (with the steps it waits for) before the others: it gets the CPUs
 * first.
 */
export const orderSteps = (steps: ModelStep[], first?: string): ModelStep[] => {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const done = new Set<string>();
  const ordered: ModelStep[] = [];
  const visit = (step: ModelStep, path: Set<string>) => {
    if (done.has(step.id)) return;
    if (path.has(step.id)) throw new Error(`The steps form a cycle at ${step.label}; BottleMod needs an acyclic workflow.`);
    path.add(step.id);
    for (const input of step.inputs) {
      const from = byId.get(input.from);
      if (from) visit(from, path);
    }
    path.delete(step.id);
    done.add(step.id);
    ordered.push(step);
  };
  const prioritised = first ? byId.get(first) : undefined;
  if (prioritised) visit(prioritised, new Set());
  for (const step of [...steps].sort((a, b) => a.measured.start - b.measured.start)) visit(step, new Set());
  return ordered;
};

const EPSILON_SECONDS = 1e-3;

/** How many of a step's tasks can run at once with these resources. */
export const slotsFor = (step: ModelStep, resources: ModelResources): number => {
  const byCpu = Math.floor(resources.cpus / reservedCpus(step, resources));
  const byMemory = step.memoryPerTask ? Math.floor(resources.memory / step.memoryPerTask) : Number.POSITIVE_INFINITY;
  return Math.max(1, Math.min(step.tasks, byCpu, byMemory));
};

/** Predicts the run with these resources. */
export const predictRun = (
  steps: ModelStep[],
  resources: ModelResources,
  options: { priority?: string } = {},
): RunPrediction => {
  const ordered = orderSteps(steps, options.priority);
  // The time span the model covers: long enough for the slowest case.
  const horizon =
    Math.max(
      60,
      ordered.reduce((sum, step) => sum + step.taskSeconds + step.cpuSeconds, 0),
      ...ordered.map((step) => step.measured.end),
    ) * 4;
  const predictions = new Map<string, StepPrediction>();
  // What is free for the next step over time: CPU time, the CPUs tasks
  // reserve, and memory. Steps earlier in the workflow come first (the paper
  // shares its link between two downloads the same way).
  let freeCpu = new PPoly([0, horizon], [[resources.cpus]]);
  let freeReserved = new PPoly([0, horizon], [[resources.cpus]]);
  let freeMemory = new PPoly([0, horizon], [[resources.memory]]);

  for (const step of ordered) {
    const cpuSeconds = Math.max(step.cpuSeconds, EPSILON_SECONDS);
    const taskSeconds = Math.max(step.taskSeconds, EPSILON_SECONDS);
    const slots = slotsFor(step, resources);
    const cpusPerTask = reservedCpus(step, resources);
    // Requirements per percent of progress.
    const needs = [
      new PPoly([0, 100], [[cpuSeconds / 100]]),
      new PPoly([0, 100], [[(taskSeconds * cpusPerTask) / 100]]),
    ];
    // Each task uses at most its own share of the cores.
    const ins = [
      clampBelow(freeCpu, Math.min(resources.cpus, slots * Math.max(step.cpuUsePerTask, 0.01))),
      clampBelow(freeReserved, slots * cpusPerTask),
    ];
    // Memory counts where it lets fewer of the step's tasks run at once than the CPUs do.
    const memoryBinds =
      step.memoryPerTask !== null &&
      Math.floor(resources.memory / step.memoryPerTask) < Math.min(step.tasks, Math.floor(resources.cpus / cpusPerTask));
    if (memoryBinds && step.memoryPerTask) {
      needs.push(new PPoly([0, 100], [[(taskSeconds * step.memoryPerTask) / 100]]));
      ins.push(clampBelow(freeMemory, slots * step.memoryPerTask));
    }

    const dataNeeds: PPoly[] = [];
    const dataIns: PPoly[] = [];
    const inputIds: string[] = [];
    for (const input of step.inputs) {
      const upstream = predictions.get(input.from);
      if (!upstream) continue;
      dataNeeds.push(
        input.kind === "burst" ? func([0, 100 - 1e-6, 100], [[0], [100]]) : func([0, 100], [[1, 0]]),
      );
      dataIns.push(extendTo(upstream.progress, horizon));
      inputIds.push(input.from);
    }
    if (dataNeeds.length === 0) {
      // A first step: all its input is there from the start.
      dataNeeds.push(func([0, 100], [[1, 0]]));
      dataIns.push(func([0, horizon], [[100]]));
    }
    let progress: PPoly;
    let bottlenecks: number[];
    try {
      ({ progress, bottlenecks } = new TaskExecution(new Task(needs, dataNeeds), ins, dataIns).result());
    } catch (error) {
      if (error instanceof NeverFinishesError) throw new Error(`${step.label} would never finish with these resources.`);
      throw error;
    }
    const limits: Limit[] = bottlenecks.map((b) =>
      b === -1
        ? { kind: "cpu" }
        : b === -2
          ? { kind: "slots" }
          : b === -3
            ? { kind: "memory" }
            : inputIds[b] !== undefined
              ? { kind: "input", from: inputIds[b] as string }
              : { kind: "slots" },
    );
    const start = firstMove(progress);
    const end = lastOf(progress.x) as number;
    predictions.set(step.id, { id: step.id, progress, limits, start, end, slots });
    // What it used, per second: progress per second × need per progress.
    const rate = extendTo(progress.derivative(), horizon, 0);
    freeCpu = clampAbove(freeCpu.sub(rate.mul(cpuSeconds / 100)), 0);
    freeReserved = clampAbove(freeReserved.sub(rate.mul((taskSeconds * cpusPerTask) / 100)), 0);
    if (memoryBinds && step.memoryPerTask) freeMemory = clampAbove(freeMemory.sub(rate.mul((taskSeconds * step.memoryPerTask) / 100)), 0);
  }
  const all = [...predictions.values()];
  const total = Math.max(...all.map((p) => p.end)) - Math.min(...all.map((p) => p.start));
  return { steps: all, total };
};

/** When progress first rises above 0. */
const firstMove = (progress: PPoly): number => {
  for (let i = 0; i < progress.pieces; i++) {
    const a = progress.x[i] as number;
    const b = progress.x[i + 1] as number;
    if (progress.at(b) > progress.at(a) + 1e-9) return a;
  }
  return progress.x[0] as number;
};

/** f, continued with its last value (or `value`) up to `until`. */
const extendTo = (f: PPoly, until: number, value?: number): PPoly => {
  const end = lastOf(f.x) as number;
  if (end >= until) return f;
  const copy = new PPoly(f.x, f.c);
  copy.extend([[value ?? f.at(end)]], [until]);
  return copy;
};

/** A piecewise constant function, capped at `cap`. */
const clampBelow = (f: PPoly, cap: number): PPoly =>
  new PPoly(f.x, f.c.map((row, k) => (k === f.c.length - 1 ? row.map((value) => Math.min(value, cap)) : row)));

/** A piecewise constant function, at least `floor`. */
const clampAbove = (f: PPoly, floor: number): PPoly =>
  new PPoly(f.x, f.c.map((row, k) => (k === f.c.length - 1 ? row.map((value) => Math.max(value, floor)) : row)));

/** What N-WAVE knows of a run, for its model. */
export interface RunModelInput {
  /** The run's trace (cached tasks are left out: they didn't run). */
  trace: Array<{
    process: string;
    status: string;
    start: number | null;
    complete: number | null;
    realtime: number | null;
    cpu: number | null;
    cpus: number | null;
    memory: number | null;
  }>;
  /** The canvas node of a process (nodeIdForProcess). */
  nodeOf: (process: string) => string | undefined;
  /** The canvas's connections, by node id. */
  edges: Array<{ source: string; target: string }>;
  /** The node's name on the canvas. */
  labelOf: (nodeId: string) => string;
}

/** The model's steps for a run: one per node that ran tasks. */
export const buildRunModel = ({ trace, nodeOf, edges, labelOf }: RunModelInput): ModelStep[] => {
  const ran = trace.filter((task) => task.status !== "CACHED" && task.start !== null && task.complete !== null);
  if (ran.length === 0) return [];
  const runStart = Math.min(...ran.map((task) => task.start as number));
  const byNode = new Map<string, typeof ran>();
  for (const task of ran) {
    const node = nodeOf(task.process);
    if (!node) continue;
    byNode.set(node, [...(byNode.get(node) ?? []), task]);
  }
  // Data flows along the canvas's connections; nodes that ran no task (File
  // Input, Parameters) pass it on.
  const targets = new Map<string, string[]>();
  for (const edge of edges) targets.set(edge.source, [...(targets.get(edge.source) ?? []), edge.target]);
  const downstreamSteps = (from: string): Set<string> => {
    const found = new Set<string>();
    const queue = [...(targets.get(from) ?? [])];
    const seen = new Set<string>();
    while (queue.length) {
      const next = queue.shift() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      if (byNode.has(next)) found.add(next);
      else queue.push(...(targets.get(next) ?? []));
    }
    return found;
  };
  const inputsOf = new Map<string, string[]>();
  for (const from of byNode.keys()) {
    for (const to of downstreamSteps(from)) inputsOf.set(to, [...(inputsOf.get(to) ?? []), from]);
  }
  return [...byNode.entries()].map(([id, tasks]) => ({
    id,
    label: labelOf(id),
    tasks: tasks.length,
    cpuSeconds: tasks.reduce((sum, task) => sum + ((task.realtime ?? 0) / 1000) * ((task.cpu ?? 0) / 100), 0),
    taskSeconds: tasks.reduce((sum, task) => sum + ((task.complete as number) - (task.start as number)) / 1000, 0),
    cpusPerTask: Math.max(1, ...tasks.map((task) => task.cpus ?? 1)),
    memoryPerTask: tasks.some((task) => task.memory) ? Math.max(...tasks.map((task) => task.memory ?? 0)) : null,
    cpuUsePerTask: Math.max(0.01, ...tasks.map((task) => (task.cpu ?? 0) / 100)),
    // A step goes on with each part of an input only when both it and the
    // step before run a task per sample; a step with one task takes all of
    // its inputs at once (MultiQC), and a single upstream task's output
    // (an index) is needed whole by every task.
    inputs: (inputsOf.get(id) ?? []).map((from) => ({
      from,
      kind: tasks.length > 1 && (byNode.get(from)?.length ?? 0) > 1 ? ("stream" as const) : ("burst" as const),
    })),
    measured: {
      start: (Math.min(...tasks.map((task) => task.start as number)) - runStart) / 1000,
      end: (Math.max(...tasks.map((task) => task.complete as number)) - runStart) / 1000,
    },
  }));
};

/** The measured runtime: from the first task's start to the last one's end (seconds). */
export const measuredRuntime = (steps: ModelStep[]): number =>
  steps.length ? Math.max(...steps.map((step) => step.measured.end)) - Math.min(...steps.map((step) => step.measured.start)) : 0;
