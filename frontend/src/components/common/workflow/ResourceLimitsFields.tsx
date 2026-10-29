import type React from "react";
import { useId } from "react";
import type { ServerLimits } from "../../../settings/useServerLimits";
import { formatMemory, memoryBytes } from "../../../utils/memory";
import { MemoryInput } from "../forms";

export interface ResourceLimits {
  maxCpus: number;
  /** e.g. "4.GB". */
  maxMemory: string;
  /** 0: the limit above it (the global one, or the server's). */
  timeoutMinutes: number;
}

interface ResourceLimitsFieldsProps {
  limits: ResourceLimits;
  onChange: (patch: Partial<ResourceLimits>) => void;
  serverLimits: ServerLimits | null;
  /** For a workflow's own limits: the global ones, which they can't exceed. */
  ceiling?: ResourceLimits;
}

const inputClass =
  "w-full px-3 py-2 bg-background border border-panel-border rounded-md text-text placeholder-text-light focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green";

const timeLimitText = (minutes: number, serverLimits: ServerLimits | null): string =>
  minutes > 0
    ? `${minutes} minutes`
    : serverLimits
      ? serverLimits.defaultTimeoutMinutes > 0
        ? `${serverLimits.defaultTimeoutMinutes} minutes, the server's limit`
        : "no time limit"
      : "the server's time limit";

/** The most a run may use: CPU cores, memory and time, with what is allowed above it. */
const ResourceLimitsFields: React.FC<ResourceLimitsFieldsProps> = ({
  limits,
  onChange,
  serverLimits,
  ceiling,
}) => {
  const fieldId = useId();
  const cpuMax = Math.min(serverLimits?.maxCpus ?? Number.POSITIVE_INFINITY, ceiling?.maxCpus ?? Number.POSITIVE_INFINITY);
  const memoryTooHigh =
    ceiling !== undefined && memoryBytes(limits.maxMemory) > memoryBytes(ceiling.maxMemory);
  const timeTooHigh =
    ceiling !== undefined &&
    ceiling.timeoutMinutes > 0 &&
    (limits.timeoutMinutes === 0 || limits.timeoutMinutes > ceiling.timeoutMinutes);

  return (
    <div className="space-y-6">
      {ceiling ? (
        <p
          role="note"
          aria-label="Global limits"
          className="rounded-md border border-panel-border p-3 text-xs text-text-light"
        >
          This workflow can use at most {ceiling.maxCpus} CPU cores,{" "}
          {formatMemory(ceiling.maxMemory)} of memory and{" "}
          {timeLimitText(ceiling.timeoutMinutes, serverLimits)}, as set in Global Settings. Higher
          values are lowered to these.
        </p>
      ) : (
        serverLimits && (
          <p
            role="note"
            aria-label="Server limits"
            className="rounded-md border border-panel-border p-3 text-xs text-text-light"
          >
            This server allows up to {serverLimits.maxCpus} CPU cores and{" "}
            {formatMemory(serverLimits.maxMemory)} of memory per run (set with NWAVE_MAX_CPUS /
            NWAVE_MAX_MEMORY); higher values are lowered to these.
          </p>
        )
      )}

      <div>
        <label htmlFor={`${fieldId}-max-cpus`} className="block text-sm font-medium text-text mb-2">
          Maximum CPU Cores
        </label>
        <input
          id={`${fieldId}-max-cpus`}
          type="number"
          min="1"
          max={Number.isFinite(cpuMax) ? cpuMax : undefined}
          value={limits.maxCpus}
          onChange={(e) => {
            const value = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(value)) onChange({ maxCpus: Math.max(1, Math.min(value, cpuMax)) });
          }}
          className={inputClass}
        />
        <p className="text-xs text-text-light mt-2">
          Maximum number of CPU cores any single process can use. Steps that ask for more are
          capped to this.
        </p>
        {ceiling && limits.maxCpus > ceiling.maxCpus && (
          <p role="alert" className="mt-1 text-xs text-yellow-500">
            More than Global Settings allow: runs get {ceiling.maxCpus} CPU cores.
          </p>
        )}
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
        </p>
        {memoryTooHigh && ceiling && (
          <p role="alert" className="mt-1 text-xs text-yellow-500">
            More than Global Settings allow: runs get {formatMemory(ceiling.maxMemory)}.
          </p>
        )}
      </div>

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
          max={ceiling && ceiling.timeoutMinutes > 0 ? ceiling.timeoutMinutes : 10080}
          value={limits.timeoutMinutes}
          onChange={(e) => onChange({ timeoutMinutes: Number.parseInt(e.target.value, 10) || 0 })}
          placeholder={ceiling ? "0 = the global limit" : "0 = server default"}
          className={inputClass}
        />
        <p className="text-xs text-text-light mt-2">
          Maximum time the workflow can run before it is stopped; each step may run as long. 0
          uses{" "}
          {ceiling
            ? `the global limit (${timeLimitText(ceiling.timeoutMinutes, serverLimits)})`
            : `the server default${
                serverLimits
                  ? serverLimits.defaultTimeoutMinutes > 0
                    ? ` (${serverLimits.defaultTimeoutMinutes} minutes, set with NWAVE_EXECUTION_TIMEOUT)`
                    : " (no limit)"
                  : " (24 hours unless NWAVE_EXECUTION_TIMEOUT says otherwise)"
              }`}
          .
        </p>
        {timeTooHigh && ceiling && limits.timeoutMinutes > 0 && (
          <p role="alert" className="mt-1 text-xs text-yellow-500">
            Longer than Global Settings allow: runs stop after {ceiling.timeoutMinutes} minutes.
          </p>
        )}
      </div>
    </div>
  );
};

export default ResourceLimitsFields;
