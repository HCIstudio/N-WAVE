// What limited a run, from its BottleMod model (runModel.ts): for each step,
// what limited it in each interval, and the chain of steps that set the
// run's total time.

import type { Limit, ModelStep, RunPrediction, StepPrediction } from "./runModel";

export interface LimitSegment {
  /** Seconds from the run's start. */
  from: number;
  to: number;
  limit: Limit;
}

/** A limit as a key, to compare and colour them. */
export const limitKey = (limit: Limit): string => (limit.kind === "input" ? `input:${limit.from}` : limit.kind);

/** "CPU", "the tasks that run at once", "waiting for STAR index". */
export const describeLimit = (limit: Limit, labelOf: (id: string) => string): string =>
  limit.kind === "cpu"
    ? "CPU"
    : limit.kind === "slots"
      ? "its tasks' running time"
      : limit.kind === "memory"
        ? "memory"
        : `waiting for ${labelOf(limit.from)}`;

/**
 * A step's limits over time, merged where they stay the same, without empty
 * intervals; from `from` on: its start, or earlier, when its inputs began
 * and it waited for them.
 */
export const limitSegments = (step: StepPrediction, from = step.start): LimitSegment[] => {
  const segments: LimitSegment[] = [];
  const x = step.progress.x;
  step.limits.forEach((limit, i) => {
    const start = Math.max(x[i] as number, from);
    const to = x[i + 1] as number;
    if (!(to > start)) return;
    const previous = segments[segments.length - 1];
    if (previous && limitKey(previous.limit) === limitKey(limit) && Math.abs(previous.to - start) < 1e-9) previous.to = to;
    else segments.push({ from: start, to, limit });
  });
  return segments;
};

/** "STAR alignment: CPU for 80 %, then waiting for STAR index for 20 %." */
export const describeStep = (label: string, segments: LimitSegment[], labelOf: (id: string) => string): string => {
  const total = segments.reduce((sum, segment) => sum + segment.to - segment.from, 0);
  if (total <= 0) return `${label}: too short to tell.`;
  // Merge the same limit wherever it occurs, in the order it first limited.
  const shares: { limit: Limit; time: number }[] = [];
  for (const segment of segments) {
    const found = shares.find((entry) => limitKey(entry.limit) === limitKey(segment.limit));
    if (found) found.time += segment.to - segment.from;
    else shares.push({ limit: segment.limit, time: segment.to - segment.from });
  }
  const shown = shares.filter((entry) => entry.time / total >= 0.05);
  const parts = (shown.length ? shown : shares.slice(0, 1)).map(
    (entry) => `${describeLimit(entry.limit, labelOf)} for ${Math.round((entry.time / total) * 100)} %`,
  );
  return `${label}: limited by ${parts.join(", then ")}.`;
};

/**
 * The chain of steps that set the run's total time: from the step that ends
 * last, back through the inputs it waited for, to a step that waited for
 * none. Each with what limited it most.
 */
export const criticalChain = (prediction: RunPrediction): StepPrediction[] => {
  const byId = new Map(prediction.steps.map((step) => [step.id, step]));
  let current = [...prediction.steps].sort((a, b) => b.end - a.end)[0];
  const chain: StepPrediction[] = [];
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    chain.unshift(current);
    seen.add(current.id);
    // The input it waited for that ended last: the one that held it up.
    const waitedFor = current.limits
      .filter((limit): limit is Extract<Limit, { kind: "input" }> => limit.kind === "input")
      .map((limit) => byId.get(limit.from))
      .filter((step): step is StepPrediction => Boolean(step))
      .sort((a, b) => b.end - a.end)[0];
    current = waitedFor;
  }
  return chain;
};

export interface RunInsight {
  measured: number;
  predicted: number;
  /** predicted / measured − 1. */
  error: number;
  steps: { id: string; label: string; measured: { start: number; end: number }; segments: LimitSegment[]; sentence: string }[];
  chain: string[];
}

/** What the model says about a run, for the Performance tab. */
export const runInsight = (model: ModelStep[], prediction: RunPrediction, measured: number): RunInsight => {
  const labelOf = (id: string) => model.find((step) => step.id === id)?.label ?? id;
  return {
    measured,
    predicted: prediction.total,
    error: measured > 0 ? prediction.total / measured - 1 : 0,
    steps: [...prediction.steps]
      .sort((a, b) => a.start - b.start)
      .map((step) => {
        // A step waits from when the first of its inputs began.
        const inputs = model.find((entry) => entry.id === step.id)?.inputs ?? [];
        const firstInput = Math.min(
          step.start,
          ...inputs.map((input) => prediction.steps.find((other) => other.id === input.from)?.start ?? step.start),
        );
        const segments = limitSegments(step, firstInput);
        const label = labelOf(step.id);
        return {
          id: step.id,
          label,
          measured: model.find((entry) => entry.id === step.id)?.measured ?? { start: 0, end: 0 },
          segments,
          sentence: describeStep(label, segments, labelOf),
        };
      }),
    chain: criticalChain(prediction).map((step) => step.id),
  };
};
