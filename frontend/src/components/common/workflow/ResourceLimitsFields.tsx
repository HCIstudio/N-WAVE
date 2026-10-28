import type React from "react";
import { useId } from "react";
import type { ServerLimits } from "../../../settings/useServerLimits";
import { MemoryInput } from "../forms";

export interface ResourceLimits {
  maxCpus: number;
  /** e.g. "4.GB". */
  maxMemory: string;
  /** 0: the server's own limit. */
  timeoutMinutes: number;
}

interface ResourceLimitsFieldsProps {
  limits: ResourceLimits;
  onChange: (patch: Partial<ResourceLimits>) => void;
  serverLimits: ServerLimits | null;
}

const inputClass =
  "w-full px-3 py-2 bg-background border border-panel-border rounded-md text-text placeholder-text-light focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green";

/** The most a run may use: CPU cores, memory and time, with what the server allows. */
const ResourceLimitsFields: React.FC<ResourceLimitsFieldsProps> = ({
  limits,
  onChange,
  serverLimits,
}) => {
  const fieldId = useId();
  const { maxCpus } = limits;
  const cpuSliderMax = Math.max(serverLimits?.maxCpus ?? 32, maxCpus);
  const filled = ((maxCpus - 1) / Math.max(1, cpuSliderMax - 1)) * 100;
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor={`${fieldId}-max-cpus`} className="block text-sm font-medium text-text mb-3">
          Maximum CPU Cores
        </label>
        <div className="flex items-center gap-4">
          <input
            id={`${fieldId}-max-cpus`}
            type="range"
            min="1"
            max={cpuSliderMax}
            value={maxCpus}
            onChange={(e) => onChange({ maxCpus: Number.parseInt(e.target.value, 10) })}
            className="flex-1 h-2 bg-accent rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #00A878 0%, #00A878 ${filled}%, #3A3A3A ${filled}%, #3A3A3A 100%)`,
            }}
          />
          <span className="text-sm font-medium text-nextflow-green bg-panel-background px-3 py-1 rounded-md min-w-[3rem] text-center">
            {maxCpus}
          </span>
        </div>
        <p className="text-xs text-text-light mt-2">
          Maximum number of CPU cores any single process can use. Steps that ask for more are
          capped to this.
        </p>
      </div>

      <div>
        <label htmlFor={`${fieldId}-max-memory`} className="block text-sm font-medium text-text mb-2">
          Maximum Memory
        </label>
        <MemoryInput
          id={`${fieldId}-max-memory`}
          value={limits.maxMemory}
          onChange={(maxMemory) => onChange({ maxMemory })}
          className={inputClass}
        />
        <p className="text-xs text-text-light mt-2">
          Maximum memory any single process can use; steps that ask for more are capped to this.
          nf-core/rnaseq needs about 6–15 GB even with its test data.
        </p>
      </div>

      {serverLimits && (
        <p
          role="note"
          aria-label="Server limits"
          className="rounded-md border border-panel-border p-3 text-xs text-text-light"
        >
          This server allows up to {serverLimits.maxCpus} CPU cores and{" "}
          {serverLimits.maxMemory.replace(".", " ")} of memory per run (set with NWAVE_MAX_CPUS /
          NWAVE_MAX_MEMORY); higher values are lowered to these.
        </p>
      )}

      <div>
        <label
          htmlFor={`${fieldId}-execution-timeout-minutes`}
          className="block text-sm font-medium text-text mb-2"
        >
          Execution Timeout (minutes)
        </label>
        <input
          id={`${fieldId}-execution-timeout-minutes`}
          type="number"
          min="0"
          max="10080"
          value={limits.timeoutMinutes}
          onChange={(e) => onChange({ timeoutMinutes: Number.parseInt(e.target.value, 10) || 0 })}
          placeholder="0 = server default"
          className={inputClass}
        />
        <p className="text-xs text-text-light mt-2">
          Maximum time the workflow can run before it is stopped; each step may run as long. 0
          uses the server default
          {serverLimits
            ? serverLimits.defaultTimeoutMinutes > 0
              ? ` (${serverLimits.defaultTimeoutMinutes} minutes, set with NWAVE_EXECUTION_TIMEOUT)`
              : " (no limit)"
            : " (24 hours unless NWAVE_EXECUTION_TIMEOUT says otherwise)"}
          .
        </p>
      </div>
    </div>
  );
};

export default ResourceLimitsFields;
