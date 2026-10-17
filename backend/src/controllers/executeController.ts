// Starting and cancelling runs, and what this server can run. Running
// itself is in execution/runWorkflow.ts; run history in runsController.ts.

import type { Request, Response } from "express";
import { getDockerStatus, getNextflowStatus } from "../execution/docker";
import { normalizeSubmittedScript } from "../execution/nextflowScript";
import {
  formatMemory,
  resolveResourceCeiling,
  resolveTimeoutMs,
} from "../execution/resources";
import { getLiveRun } from "../execution/runRegistry";
import { runNextflowWorkflow } from "../execution/runWorkflow";
import { executeSingleProcess, rememberInputs } from "../execution/singleProcess";
import type { ExecutionSettings } from "../execution/types";
import { getErrorMessage } from "../utils/errors";
import { cancelExecutionSchema, executeRequestSchema } from "../validation/schemas";
import { parseBody } from "../validation/validate";

/** Settings for requests that send none (older clients). */
const fallbackSettings = (
  overrides: Pick<ExecutionSettings, "useDocker" | "containerImage" | "outputDirectory" | "outputNaming">
): ExecutionSettings => ({
  ...overrides,
  maxCpus: 4,
  maxMemory: "4 GB",
  executionTimeout: 0,
  errorStrategy: "terminate",
  publishMode: "copy",
  cleanupOnFailure: true,
});

export const executeProcess = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(executeRequestSchema, req, res);
  if (!body) return;

  const {
    script,
    inputs,
    nodeId,
    useDocker = false,
    containerImage = "ubuntu:22.04",
    outputDirectory = "results",
    nextflowScript,
    workflowName = "workflow",
    fileContent,
    executionSettings,
    workflowId,
  } = body;

  console.log("Execute request received:", {
    hasScript: !!script,
    hasNextflowScript: !!nextflowScript,
    useDocker,
    containerImage,
    workflowName,
  });

  // A Pipeline node runs a whole nf-core pipeline instead of a script.
  if (body.pipeline) {
    await runNextflowWorkflow(
      {
        nextflowScript: "",
        workflowName,
        settings:
          executionSettings ||
          fallbackSettings({
            useDocker: true,
            containerImage,
            outputDirectory,
            outputNaming: "{workflow_name}_{timestamp}",
          }),
        fileContent,
        pipeline: body.pipeline,
        workflowId,
      },
      res
    );
    return;
  }

  // A full Nextflow workflow.
  if (nextflowScript) {
    let normalizedScript: string;
    try {
      normalizedScript = normalizeSubmittedScript(nextflowScript);
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    await runNextflowWorkflow(
      {
        nextflowScript: normalizedScript,
        workflowName,
        settings:
          executionSettings ||
          fallbackSettings({
            useDocker,
            containerImage,
            outputDirectory,
            outputNaming: "{workflow_name}",
          }),
        fileContent,
        workflowId,
      },
      res
    );
    return;
  }

  // Otherwise a single process (legacy). The schema guarantees `script` is
  // present when `nextflowScript` is not.
  if (inputs && inputs.length > 0 && nodeId) rememberInputs(nodeId, inputs);
  executeSingleProcess(script ?? "", nodeId ?? "", useDocker, containerImage, res);
};

export const cancelExecution = (req: Request, res: Response): void => {
  const body = parseBody(cancelExecutionSchema, req, res);
  if (!body) return;
  const { executionId } = body;

  const run = getLiveRun(executionId);
  if (!run) {
    res.status(404).json({
      error: "Execution not found or already completed",
      executionId,
    });
    return;
  }
  try {
    // Stops Nextflow, its tasks and its runner container; the run's stream
    // reports "Execution cancelled" once it has ended.
    run.stop("cancelled");
    res.json({ message: "Execution cancelled successfully", executionId });
  } catch (error: unknown) {
    console.error("Failed to cancel execution:", error);
    res.status(500).json({
      error: "Failed to cancel execution",
      details: getErrorMessage(error),
    });
  }
};

export const checkDockerStatus = async (_req: Request, res: Response): Promise<void> => {
  res.json(await getDockerStatus());
};

export const checkNextflowStatus = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.json(await getNextflowStatus());
};

/**
 * `{ maxCpus, maxMemory, defaultTimeoutMinutes }`: the most a run may use on
 * this server, and its time limit when a run sets none (0 = none).
 */
export const getExecutionLimits = (_req: Request, res: Response): void => {
  const ceiling = resolveResourceCeiling();
  res.json({
    maxCpus: ceiling.cpus,
    maxMemory: formatMemory(ceiling.memory),
    maxMemoryBytes: ceiling.memory,
    source: ceiling.source,
    defaultTimeoutMinutes: Math.round(resolveTimeoutMs(0) / 60_000),
  });
};
