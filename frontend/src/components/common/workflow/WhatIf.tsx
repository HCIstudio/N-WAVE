import type React from "react";
import { useId, useMemo, useState } from "react";
import type { RunProfile } from "../../../execution/runProfiles";
import { memoryBytes } from "../../../utils/memory";
import { runInsight } from "../../../insight/bottlemod/runInsight";
import { type ModelResources, type ModelStep, predictRun } from "../../../insight/bottlemod/runModel";
import { BOTTLEMOD_PAPER, formatSeconds } from "./RunBottlenecks";

/**
 * What a run profile gives a run: on a cluster, as many jobs at once as its
 * queue allows, each with the profile's CPUs and memory. Null for a profile
 * that runs on this computer, or that doesn't say.
 */
export const profileResources = (profile: RunProfile): { cpus: number; memoryGb: number } | null => {
  if (profile.executor === "local" || !profile.cpus || !profile.memory) return null;
  const jobs = profile.queueSize ?? 1;
  const memory = memoryBytes(profile.memory.replace(" ", "."));
  if (!Number.isFinite(memory)) return null;
  return { cpus: jobs * profile.cpus, memoryGb: Math.round((jobs * memory) / 1024 ** 3) };
};

export interface WhatIfSettings {
  /** The CPUs the run's tasks share. */
  cpus: number;
  /** The most CPUs one step's task may ask for (Maximum CPU Cores). */
  cpusPerTask?: number;
  /** GB. */
  memoryGb: number;
  /** A step that gets the CPUs first (with the steps it waits for). */
  priority: string | null;
}

/** Settings far from the measured run: the model was fitted there, so it says less. */
export const distanceFromMeasured = (settings: WhatIfSettings, measured: ModelResources): number => {
  const memory = settings.memoryGb * 1024 ** 3;
  return Math.max(settings.cpus / measured.cpus, measured.cpus / settings.cpus, memory / measured.memory, measured.memory / memory);
};

/** At most this factor from the measured run, the prediction counts as close to it. */
export const CERTAIN_WITHIN = 2;

export interface WhatIfResult {
  predicted: number | null;
  /** Why there is no prediction (a step would never finish). */
  problem?: string;
  chain: string[];
  /** The step limited longest by each kind of limit. */
  sentences: string[];
  lessCertain: boolean;
}

/** The prediction for other settings: milliseconds, so it follows the sliders. */
export const predictWhatIf = (model: ModelStep[], measured: ModelResources, settings: WhatIfSettings): WhatIfResult => {
  const resources = { cpus: settings.cpus, memory: settings.memoryGb * 1024 ** 3, cpusPerTask: settings.cpusPerTask };
  const lessCertain = distanceFromMeasured(settings, measured) > CERTAIN_WITHIN;
  try {
    const prediction = predictRun(model, resources, { priority: settings.priority ?? undefined });
    const insight = runInsight(model, prediction, 0);
    return {
      predicted: prediction.total,
      chain: insight.chain.map((id) => model.find((step) => step.id === id)?.label ?? id),
      sentences: insight.steps.filter((step) => insight.chain.includes(step.id)).map((step) => step.sentence),
      lessCertain,
    };
  } catch (error) {
    return { predicted: null, problem: (error as Error).message, chain: [], sentences: [], lessCertain };
  }
};

/** Change the run's resources in its model and see the predicted runtime and bottlenecks. */
const WhatIf: React.FC<{
  model: ModelStep[];
  /** What the measured run had. */
  resources: ModelResources;
  measured: number;
  /** Run profiles to try. */
  profiles?: RunProfile[];
}> = ({ model, resources, measured, profiles: runProfiles = [] }) => {
  const profiles = runProfiles.flatMap((profile) => {
    const given = profileResources(profile);
    return given ? [{ name: profile.name, ...given }] : [];
  });
  const id = useId();
  const [settings, setSettings] = useState<WhatIfSettings>({
    cpus: resources.cpus,
    cpusPerTask: resources.cpusPerTask,
    memoryGb: Math.round(resources.memory / 1024 ** 3),
    priority: null,
  });
  const result = useMemo(() => predictWhatIf(model, resources, settings), [model, resources, settings]);
  const change = result.predicted === null ? null : result.predicted / measured - 1;
  return (
    <section aria-label="What if" className="space-y-3 border-t border-gray-200 pt-3">
      <h3 className="text-sm font-semibold">What if?</h3>
      <p className="text-xs text-gray-700">
        Change the resources and see what the model of this run predicts, before running again.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-gray-800" htmlFor={`${id}-cpus`}>
          CPUs (the computer&apos;s, or a cluster&apos;s): <strong>{settings.cpus}</strong>
          <input
            id={`${id}-cpus`}
            type="range"
            min={1}
            max={Math.max(32, resources.cpus * 4)}
            value={settings.cpus}
            onChange={(event) => setSettings({ ...settings, cpus: Number(event.target.value) })}
            className="block w-full accent-nextflow-green"
          />
        </label>
        <label className="block text-xs text-gray-800" htmlFor={`${id}-per-step`}>
          Most CPUs per step (Maximum CPU Cores): <strong>{settings.cpusPerTask ?? settings.cpus}</strong>
          <input
            id={`${id}-per-step`}
            type="range"
            min={1}
            max={settings.cpus}
            value={Math.min(settings.cpusPerTask ?? settings.cpus, settings.cpus)}
            onChange={(event) => setSettings({ ...settings, cpusPerTask: Number(event.target.value) })}
            className="block w-full accent-nextflow-green"
          />
        </label>
        <label className="block text-xs text-gray-800" htmlFor={`${id}-memory`}>
          Memory: <strong>{settings.memoryGb} GB</strong>
          <input
            id={`${id}-memory`}
            type="range"
            min={1}
            max={Math.max(64, Math.round((resources.memory / 1024 ** 3) * 4))}
            value={settings.memoryGb}
            onChange={(event) => setSettings({ ...settings, memoryGb: Number(event.target.value) })}
            className="block w-full accent-nextflow-green"
          />
        </label>
        <label className="block text-xs text-gray-800">
          Give a step the CPUs first
          <select
            value={settings.priority ?? ""}
            onChange={(event) => setSettings({ ...settings, priority: event.target.value || null })}
            className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value="">No step (in the workflow's order)</option>
            {model.map((step) => (
              <option key={step.id} value={step.id}>
                {step.label}
              </option>
            ))}
          </select>
        </label>
        {profiles.length > 0 && (
          <label className="block text-xs text-gray-800">
            A run profile's resources
            <select
              defaultValue=""
              onChange={(event) => {
                const profile = profiles.find((candidate) => candidate.name === event.target.value);
                if (profile) setSettings({ ...settings, cpus: profile.cpus, cpusPerTask: undefined, memoryGb: profile.memoryGb });
              }}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs"
            >
              <option value="">Choose…</option>
              {profiles.map((profile) => (
                <option key={profile.name} value={profile.name}>
                  {profile.name} ({profile.cpus} CPUs, {profile.memoryGb} GB)
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div aria-live="polite" className="space-y-1 text-sm" data-testid="what-if-result">
        {result.predicted === null ? (
          <p>{result.problem}</p>
        ) : (
          <>
            <p>
              Predicted <strong>{formatSeconds(result.predicted)}</strong>
              {change !== null && Math.abs(change) >= 0.005
                ? ` (${Math.abs(Math.round(change * 100))} % ${change < 0 ? "faster" : "slower"} than the ${formatSeconds(measured)} measured)`
                : ` (the ${formatSeconds(measured)} measured)`}
              .
            </p>
            <p className="text-xs text-gray-700">Set by: {result.chain.join(" → ")}.</p>
            <ul className="list-disc pl-5 text-xs text-gray-700">
              {result.sentences.map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
          </>
        )}
        <p className={`text-xs ${result.lessCertain ? "font-medium text-yellow-800" : "text-gray-600"}`}>
          {result.lessCertain
            ? `Less certain: these settings are far from the ${resources.cpus} CPUs and ${Math.round(resources.memory / 1024 ** 3)} GB the model was fitted to.`
            : "An estimate from this run's measurements."}{" "}
          {settings.cpus !== resources.cpus
            ? "The model overrates what CPUs change: on Demo 3, half or twice the CPUs changed the runtime by about a quarter, and the model said by a half. "
            : ""}
          BottleMod, Lößer et al. (
          <a href={BOTTLEMOD_PAPER} target="_blank" rel="noreferrer" className="text-nextflow-green underline">
            ICPE '25
          </a>
          ).
        </p>
      </div>
    </section>
  );
};

export default WhatIf;
