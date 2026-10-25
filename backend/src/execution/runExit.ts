// What a run's end means: the lines the browser gets, and how the run is
// recorded in its history.

import { summarizeFailure } from "./failureSummary";
import { diagnoseResourceFailure, type RunResourceLimits } from "./resources";
import type { RunExit } from "./runner";

export interface RunEnding {
  /** Appended to the run's output (and its log). */
  output: string;
  status: "succeeded" | "failed" | "cancelled";
  /** Why it failed, for the run history. */
  summary?: string;
}

export const describeRunExit = (
  exit: Pick<RunExit, "code" | "stopReason" | "outputTail">,
  context: { limits: RunResourceLimits; timeoutMs: number; runDir: string }
): RunEnding => {
  const { code, stopReason, outputTail } = exit;
  if (stopReason === "shutdown") {
    return {
      output: "\nN-WAVE: the run was stopped because N-WAVE shut down. Resume it to reuse the steps it finished.\n",
      status: "cancelled",
      summary: "Stopped because N-WAVE shut down.",
    };
  }
  if (stopReason === "cancelled") {
    return { output: "\nExecution cancelled\n", status: "cancelled" };
  }
  if (stopReason === "timeout") {
    const minutes = Math.max(1, Math.round(context.timeoutMs / 60_000));
    return {
      output:
        `\nN-WAVE resource problem: the run was stopped after its time limit of ${minutes} minute${minutes === 1 ? "" : "s"}. Raise Execution Timeout in the execution settings (0 uses the server default, NWAVE_EXECUTION_TIMEOUT).\n` +
        `Nextflow execution failed with exit code: ${code ?? "timeout"}\n`,
      status: "failed",
      summary: `Stopped after the time limit of ${minutes} minutes.`,
    };
  }
  if (code !== 0) {
    const diagnosis = diagnoseResourceFailure(outputTail, context.limits);
    return {
      output: `${diagnosis ? `\nN-WAVE resource problem: ${diagnosis}\n` : ""}\nNextflow execution failed with exit code: ${code}\n`,
      status: "failed",
      summary:
        diagnosis ?? summarizeFailure(outputTail) ?? `Nextflow exited with code ${code}.`,
    };
  }
  return {
    output: `\nNextflow execution completed successfully\nResults available in: ${context.runDir}\n`,
    status: "succeeded",
  };
};
