import type React from "react";
import type { Edge, Node } from "@xyflow/react";
import { useEffect, useState } from "react";
import { getRunLog, getRunTrace } from "../../../api/runs";
import { nodeIdForProcess } from "../../../execution/nodeRuns";
import { type RunInsight, limitKey, runInsight } from "../../../insight/bottlemod/runInsight";
import { buildRunModel, measuredRuntime, type ModelResources, type ModelStep, predictRun } from "../../../insight/bottlemod/runModel";
import { wikiUrl } from "../../../docs/links";
import { useRunDefaults } from "../../../settings/useRunDefaults";
import WhatIf from "./WhatIf";
import { useServerLimits } from "../../../settings/useServerLimits";
import { memoryBytes } from "../../../utils/memory";

export const BOTTLEMOD_PAPER = "https://doi.org/10.1145/3676151.3719382";

/** Colours of what limited a step (checked for colour-blind separation; each row also says it in words). */
export const LIMIT_COLOURS: Record<string, { colour: string; label: string }> = {
  cpu: { colour: "#2a78d6", label: "CPU" },
  slots: { colour: "#1baf7a", label: "tasks running (how fast, how many at once)" },
  memory: { colour: "#eda100", label: "memory" },
  input: { colour: "#9ca3af", label: "waiting for an input" },
};
const colourOf = (key: string) => (LIMIT_COLOURS[key.startsWith("input:") ? "input" : key] ?? LIMIT_COLOURS.input)?.colour;

/**
 * The run's limits from its log's first lines ("N-WAVE limits: 4 CPUs, 4 GB
 * memory"): the most one step's task may ask for (Nextflow's
 * process.resourceLimits), the CPUs also as `cpus` until the computer's are known.
 */
/** The prediction for the limits in Execution Settings, from the run shown on the canvas. */
export const SettingsPrediction: React.FC<{ state: RunModelState | null | "unavailable"; cpus: number; memory: number }> = ({
  state,
  cpus,
  memory,
}) => {
  if (!state || state === "unavailable" || !(cpus > 0) || !(memory > 0)) return null;
  // The workflow's Maximum CPU Cores caps each step; its tasks share the computer's CPUs.
  let predicted: number;
  try {
    predicted = predictRun(state.model, { ...state.resources, cpusPerTask: cpus }).total;
  } catch {
    return null;
  }
  const measuredCap = state.resources.cpusPerTask ?? state.resources.cpus;
  const far = Math.max(cpus / measuredCap, measuredCap / cpus) > 2;
  void memory;
  return (
    <p className="mt-4 rounded-md border border-panel-border p-3 text-sm text-text" data-testid="settings-prediction">
      With these limits, the model of the run shown on the canvas predicts <strong>{formatSeconds(predicted)}</strong>{" "}
      (it took {formatSeconds(state.measured)} with at most {measuredCap} CPUs per step, on {state.resources.cpus} CPUs).{" "}
      {far ? "Less certain: these limits are far from that run's. " : ""}An estimate; BottleMod, Lößer et al.
    </p>
  );
};

export const readRunResources = (log: string): ModelResources | null => {
  const match = log.match(/N-WAVE limits: (\d+) CPUs?, ([\d.]+) ([KMGT]B) memory/);
  if (!match) return null;
  const unit = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[match[3] as "KB"] ?? 1;
  return { cpus: Number(match[1]), memory: Number(match[2]) * unit, cpusPerTask: Number(match[1]) };
};

export interface RunModelState {
  model: ModelStep[];
  resources: ModelResources;
  measured: number;
}

/** The run's BottleMod model, from its trace and log, on the canvas it ran. */
export const useRunModel = (runId: string | null, nodes: Node[], edges: Edge[]): RunModelState | null | "unavailable" => {
  const [state, setState] = useState<RunModelState | null | "unavailable">(null);
  // The run's tasks share the server's CPUs (Nextflow runs as many at once as
  // there are); the run's limit caps each step. The demo has no server: its
  // recorded runs had the limit at the computer's CPUs.
  const server = useServerLimits();
  const serverCpus = server?.maxCpus;
  const serverMemory = server ? memoryBytes(server.maxMemory) : Number.NaN;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the model is of the run; the canvas is read once per run.
  useEffect(() => {
    setState(null);
    if (!runId) return;
    let cancelled = false;
    Promise.all([getRunTrace(runId), getRunLog(runId).catch(() => "")]).then(
      ([trace, log]) => {
        if (cancelled) return;
        const model = buildRunModel({
          trace,
          nodeOf: (process) => nodeIdForProcess(process, nodes),
          edges,
          labelOf: (id) => {
            const label = nodes.find((node) => node.id === id)?.data.label;
            return typeof label === "string" && label ? label : id;
          },
        });
        const limits = readRunResources(log);
        const resources = limits && {
          ...limits,
          cpus: Math.max(limits.cpus, serverCpus ?? 0),
          memory: Math.max(limits.memory, Number.isFinite(serverMemory) ? serverMemory : 0),
        };
        if (model.length === 0 || !resources) {
          setState("unavailable");
          return;
        }
        setState({ model, resources, measured: measuredRuntime(model) });
      },
      () => !cancelled && setState("unavailable"),
    );
    return () => {
      cancelled = true;
    };
  }, [runId, serverCpus, serverMemory]);
  return state;
};

/** "19.4 s", "3 min 30 s", "1 h 5 min": precise enough to compare a prediction with a run. */
export const formatSeconds = (seconds: number): string => {
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const whole = Math.round(seconds);
  if (whole < 3600) return `${Math.floor(whole / 60)} min ${whole % 60} s`;
  return `${Math.floor(whole / 3600)} h ${Math.round((whole % 3600) / 60)} min`;
};

const percent = (error: number) => `${Math.abs(Math.round(error * 100))} % ${error < 0 ? "less" : "more"}`;

/** Predicted against measured, labelled as the estimate it is. */
export const PredictionLine: React.FC<{ insight: RunInsight; resources: ModelResources }> = ({ insight, resources }) => (
  <p className="text-sm" data-testid="bottleneck-prediction">
    Predicted <strong>{formatSeconds(insight.predicted)}</strong>, measured{" "}
    <strong>{formatSeconds(insight.measured)}</strong> ({percent(insight.error)}). An estimate fitted to this run,
    with its {resources.cpus} CPUs
    {resources.cpusPerTask && resources.cpusPerTask < resources.cpus ? ` (at most ${resources.cpusPerTask} per step)` : ""} and{" "}
    {Math.round(resources.memory / 1024 ** 3)} GB of memory.
  </p>
);

/** Each step over the run's time, coloured by what limited it (BottleMod, Fig. 4 and 8). */
const LimitTimeline: React.FC<{ insight: RunInsight }> = ({ insight }) => {
  const span = Math.max(insight.predicted, insight.measured, 0.001);
  return (
    <ol aria-label="What limited each step" className="space-y-2">
      {insight.steps.map((step) => (
        <li key={step.id} className="text-xs">
          <div className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate font-medium" title={step.label}>
              {step.label}
            </span>
            <div className="relative h-5 flex-1" aria-hidden>
              {/* Predicted: coloured by what limited it. */}
              {step.segments.map((segment) => (
                <div
                  key={`${segment.from}-${limitKey(segment.limit)}`}
                  className="absolute top-0 h-3 rounded-sm"
                  title={`${(segment.to - segment.from).toFixed(1)} s`}
                  style={{
                    left: `${(segment.from / span) * 100}%`,
                    width: `max(2px, calc(${((segment.to - segment.from) / span) * 100}% - 2px))`,
                    background: colourOf(limitKey(segment.limit)),
                  }}
                />
              ))}
              {/* Measured: thin and grey, below. */}
              <div
                className="absolute top-4 h-1 rounded-sm bg-gray-400"
                style={{
                  left: `${(step.measured.start / span) * 100}%`,
                  width: `max(2px, ${((step.measured.end - step.measured.start) / span) * 100}%)`,
                }}
              />
            </div>
          </div>
          <p className="pl-42 text-gray-700">{step.sentence}</p>
        </li>
      ))}
    </ol>
  );
};

/**
 * What limited the run: per step over time, and the chain of steps that set
 * its runtime, from its BottleMod model; the prediction next to the measured
 * runtime.
 */
const RunBottlenecks: React.FC<{
  runId: string;
  nodes: Node[];
  edges: Edge[];
  /** Highlights the chain on the canvas (null: none). */
  onShowChain?: (nodeIds: string[] | null) => void;
  shownChain?: boolean;
}> = ({ runId, nodes, edges, onShowChain, shownChain = false }) => {
  const state = useRunModel(runId, nodes, edges);
  const { defaults } = useRunDefaults();
  if (state === null) return <p className="text-sm text-gray-700">Modelling the run…</p>;
  if (state === "unavailable") {
    return (
      <p className="text-sm text-gray-700">
        This run can't be modelled: its trace has no finished steps of this workflow, or its log doesn't say its limits.
      </p>
    );
  }
  let insight: RunInsight;
  try {
    insight = runInsight(state.model, predictRun(state.model, state.resources), state.measured);
  } catch (error) {
    return <p className="text-sm text-gray-700">The model couldn't be worked out for this run: {String((error as Error).message)}</p>;
  }
  const labelOf = (id: string) => insight.steps.find((step) => step.id === id)?.label ?? id;
  return (
    <section aria-label="What limited this run" className="space-y-3 border-t border-gray-200 pt-3">
      <h3 className="text-sm font-semibold">What limited this run</h3>
      <PredictionLine insight={insight} resources={state.resources} />
      <ul aria-label="Limits" className="flex flex-wrap gap-3 text-xs text-gray-700">
        {Object.entries(LIMIT_COLOURS).map(([key, { colour, label }]) => (
          <li key={key} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: colour }} />
            {label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1">
          <span className="inline-block h-1 w-3 rounded-sm bg-gray-400" />
          measured
        </li>
      </ul>
      <LimitTimeline insight={insight} />
      <div className="space-y-1 text-sm">
        <p data-testid="bottleneck-chain">
          The chain that set the runtime: {insight.chain.map(labelOf).join(" → ")}.
        </p>
        {onShowChain && (
          <button
            type="button"
            onClick={() => onShowChain(shownChain ? null : insight.chain)}
            aria-pressed={shownChain}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-100"
          >
            {shownChain ? "Hide the chain on the canvas" : "Show the chain on the canvas"}
          </button>
        )}
      </div>
      <WhatIf model={state.model} resources={state.resources} measured={state.measured} profiles={defaults.runProfiles} />
      <p className="text-xs text-gray-600">
        Modelled with BottleMod by Lößer et al., "BottleMod: Modeling Data Flows and Tasks for Fast Bottleneck Analysis" (
        <a href={BOTTLEMOD_PAPER} target="_blank" rel="noreferrer" className="text-nextflow-green underline">
          ICPE '25
        </a>
        ).{" "}
        <a href={wikiUrl({ page: "Bottleneck-Analysis" })} target="_blank" rel="noreferrer" className="text-nextflow-green underline">
          How the model works
        </a>
      </p>
    </section>
  );
};

export default RunBottlenecks;
