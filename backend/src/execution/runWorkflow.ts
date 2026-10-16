// Running a workflow or nf-core pipeline: setting up its folder, starting
// Nextflow, streaming its output to the browser (and the run's log), and
// recording how it ended.

import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import {
  getPipelineNextflowRequirement,
  resolvePipelineNextflowVersion,
} from "../pipelines/nextflowRequirement";
import { finishRun, RUN_LOG_FILE, recordRun } from "../runs/runIndex";
import { getErrorMessage } from "../utils/errors";
import type { PipelineRunRequest } from "../validation/schemas";
import {
  DEFAULT_NEXTFLOW_VERSION,
  resolveOutputName,
  sanitizeWorkflowName,
} from "./command";
import { buildNextflowLaunch } from "./nextflowLauncher";
import { preparePipelineRun, prepareScriptRun } from "./prepareRun";
import {
  buildResourceLimitsConfig,
  describeRunLimits,
  resolveRunLimits,
  resolveTimeoutMs,
} from "./resources";
import {
  createRunDirectories,
  moveNextflowMetadata,
  writeInputFiles,
} from "./runDirectory";
import { describeRunExit } from "./runExit";
import { startRun } from "./runner";
import { registerRun, unregisterRun } from "./runRegistry";
import type { ExecutionSettings } from "./types";

export interface WorkflowRunRequest {
  /** The Nextflow script ("" for a pipeline). */
  nextflowScript: string;
  workflowName: string;
  settings: ExecutionSettings;
  fileContent?: Record<string, string>;
  pipeline?: PipelineRunRequest;
  /** Keeps the run in this workflow's history. */
  workflowId?: string;
}

/** Headers for the streamed run output. */
const STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Transfer-Encoding": "chunked",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  // Ask proxies (nginx) not to buffer the stream, and browsers not to hold
  // back its first kilobyte to sniff the content type.
  "X-Accel-Buffering": "no",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Run the workflow and stream its output into `res`. The first line names
 * the run ("N-WAVE run: <id>"), which the browser uses to cancel it and
 * find its results. Setup failures before the stream starts answer 500.
 */
export const runNextflowWorkflow = async (
  request: WorkflowRunRequest,
  res: Response
): Promise<void> => {
  const { settings, pipeline } = request;
  // Set once the run is recorded, so setup failures land in its history.
  let runId: string | null = null;
  let runLog: fs.WriteStream | null = null;
  try {
    const name = sanitizeWorkflowName(request.workflowName);
    const dirs = createRunDirectories(
      settings.outputDirectory || "results",
      resolveOutputName(settings.outputNaming, name)
    );
    console.log(`Main output directory: ${dirs.main}`);

    // Identifies the run for cancellation, results, its log and the runner
    // container. Recorded now, so a failure while setting up is listed too.
    const id = `${name}_${Date.now()}`;
    runId = id;
    try {
      recordRun(id, dirs.main, {
        workflowId: request.workflowId,
        workflowName: request.workflowName,
      });
    } catch (error: unknown) {
      console.warn(`Could not record run ${id}:`, error);
    }
    // Everything sent to the browser is also kept in the run's log.
    const log = fs.createWriteStream(path.join(dirs.main, RUN_LOG_FILE), {
      flags: "a",
    });
    runLog = log;
    const send = (text: string) => {
      res.write(text);
      log.write(text);
    };

    // The run's limits, clamped to what this server allows (see
    // resources.ts); applied as process.resourceLimits.
    const limits = resolveRunLimits(settings);
    const resourceConfig = buildResourceLimitsConfig(limits);
    const timeoutMs = resolveTimeoutMs(settings.executionTimeout);

    const scriptPath = path.join(dirs.workflow, `${name}.nf`);
    if (pipeline) {
      console.log(
        `Running nf-core/${pipeline.name} ${pipeline.version} (-profile ${pipeline.profiles.join(",")})`
      );
    }
    const prepared = pipeline
      ? preparePipelineRun(dirs, pipeline, resourceConfig)
      : await prepareScriptRun(dirs, scriptPath, request.nextflowScript, {
          useDocker: settings.useDocker,
          resourceConfig,
        });
    writeInputFiles(dirs.inputs, request.fileContent);

    const selectedNextflowVersion =
      settings.nextflowVersion || DEFAULT_NEXTFLOW_VERSION;
    // A pipeline may need a newer Nextflow than the one selected
    // (nf-core/rnaseq 3.27.0 needs 25.10.4); run it with that version.
    const requiredNextflowVersion = pipeline
      ? await getPipelineNextflowRequirement(pipeline.name, pipeline.version)
      : null;
    const nextflowVersion = resolvePipelineNextflowVersion(
      selectedNextflowVersion,
      requiredNextflowVersion
    );
    const raisedNextflowVersion = nextflowVersion !== selectedNextflowVersion;

    const launch = await buildNextflowLaunch({
      runId: id,
      runDir: dirs.main,
      scriptName: name,
      scriptPath,
      pipeline: pipeline
        ? {
            name: pipeline.name,
            version: pipeline.version,
            profiles: pipeline.profiles,
            withParamsFile: Object.keys(pipeline.params).length > 0,
          }
        : undefined,
      hasNfCoreModules: prepared.hasNfCoreModules,
      useProcessDocker: prepared.useProcessDocker,
      maxCpus: limits.cpus,
      maxMemory: limits.memory,
      nextflowVersion,
      raisedNextflowVersion,
    });
    console.log(`Executing: ${launch.command}`);
    console.log(`Working directory: ${dirs.main}`);

    res.writeHead(200, STREAM_HEADERS);
    send(`N-WAVE run: ${id}\n`);
    send(`${describeRunLimits(limits, timeoutMs)}\n`);
    if (pipeline && raisedNextflowVersion) {
      send(
        `N-WAVE: nf-core/${pipeline.name} ${pipeline.version} needs Nextflow ${requiredNextflowVersion} or newer; this run uses ${nextflowVersion}.\n`
      );
    }

    const run = startRun({
      command: launch.command,
      cwd: dirs.main,
      timeoutMs,
      containerName: launch.containerName,
      onOutput: (output) => {
        console.log(`OUTPUT: ${output}`);
        send(output);
      },
      onExit: (exit) => {
        unregisterRun(id);
        const ending = describeRunExit(exit, {
          limits,
          timeoutMs,
          runDir: dirs.main,
        });
        console.log(`Execution ${id} ${ending.status}`);
        send(ending.output);
        if (ending.status === "succeeded") moveNextflowMetadata(dirs);
        finishRun(id, ending.status, ending.summary);
        log.end();
        res.end();
      },
    });
    registerRun(id, run);
  } catch (error: unknown) {
    console.error("Setup error:", error);
    const message = `Failed to setup workflow execution: ${getErrorMessage(error)}`;
    if (runId) {
      runLog?.write(`\n${message}\n`);
      finishRun(runId, "failed", getErrorMessage(error));
    }
    runLog?.end();
    if (res.headersSent) {
      res.write(`\n${message}\n`);
      res.end();
      return;
    }
    res
      .status(500)
      .json({ error: message, ...(runId ? { runId } : {}) });
  }
};
