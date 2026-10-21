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
import {
  findResumableRun,
  finishRun,
  isRunDirInUse,
  RUN_LOG_FILE,
  recordRun,
} from "../runs/runIndex";
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
  openRunDirectories,
  restoreNextflowMetadata,
  writeInputFiles,
} from "./runDirectory";
import { describeRunExit } from "./runExit";
import { startRun } from "./runner";
import { isRunLive, registerRun, unregisterRun } from "./runRegistry";
import type { ExecutionSettings } from "./types";
import { removeRunTaskContainers } from "./taskContainers";
import { isLaunchGateBusy, isLaunchLine, passLaunchGate } from "./launchGate";

export interface WorkflowRunRequest {
  /** The Nextflow script ("" for a pipeline). */
  nextflowScript: string;
  workflowName: string;
  settings: ExecutionSettings;
  fileContent?: Record<string, string>;
  /** Files of fileContent that are base64 (binary files). */
  fileEncoding?: Record<string, "base64">;
  pipeline?: PipelineRunRequest;
  /** Keeps the run in this workflow's history. */
  workflowId?: string;
  /** Resume the workflow's last run: reuse its unchanged steps (Nextflow -resume). */
  resume?: boolean;
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
 * The run's folder name under `outputDirectory`: `outputName`, or with `_2`,
 * `_3`… when that folder exists, so runs never share a folder or log (an
 * empty or `{date}` naming pattern repeats).
 */
export const uniqueOutputName = (outputDirectory: string, outputName: string): string => {
  const base = path.resolve(outputDirectory);
  let candidate = outputName;
  for (let n = 2; fs.existsSync(path.join(base, candidate)); n++) {
    candidate = `${outputName}_${n}`;
  }
  return candidate;
};

/**
 * The run a resumed run continues: the workflow's last run with a cache,
 * unless a run is still going in its folder (two runs can't share one).
 */
const findRunToResume = (workflowId: string | undefined): { id: string; dir: string } | null => {
  if (!workflowId) return null;
  const run = findResumableRun(workflowId);
  return run && !isRunDirInUse(run.dir, isRunLive) ? run : null;
};

/** Log files of a resumed run, in the folder it shares with earlier runs. */
export const resumedRunLogs = (id: string): { log: string; nextflowLog: string } => ({
  log: `nwave-run.${id}.log`,
  nextflowLog: `nextflow/.nextflow.${id}.log`,
});

/**
 * Run the workflow and stream its output into `res`. The first line names
 * the run ("N-WAVE run: <id>"), which the browser uses to cancel it and
 * find its results. Setup failures before the stream starts answer 500.
 */
/** Record how a run ended; a history that can't be written doesn't stop the run's ending. */
const recordEnd = (...args: Parameters<typeof finishRun>): void => {
  try {
    finishRun(...args);
  } catch (error: unknown) {
    console.warn(`Could not record how run ${args[0]} ended:`, error);
  }
};

export const runNextflowWorkflow = async (
  request: WorkflowRunRequest,
  res: Response
): Promise<void> => {
  const { settings, pipeline } = request;
  // Set once the run is recorded, so setup failures land in its history.
  let runId: string | null = null;
  let runLog: fs.WriteStream | null = null;
  let cancelledInSetup = false;
  // Opens the pipeline's launch gate (see launchGate.ts) for the next run.
  let openGate = () => {};
  try {
    const name = sanitizeWorkflowName(request.workflowName);
    const outputDirectory = settings.outputDirectory || "results";
    // Identifies the run for cancellation, results, its log and the runner
    // container.
    const id = `${name}_${Date.now()}`;
    const resumed = request.resume ? findRunToResume(request.workflowId) : null;
    const dirs = resumed
      ? openRunDirectories(resumed.dir)
      : createRunDirectories(
          outputDirectory,
          uniqueOutputName(outputDirectory, resolveOutputName(settings.outputNaming, name))
        );
    console.log(`Main output directory: ${dirs.main}`);
    // A resumed run shares the folder, so it keeps its logs apart.
    const logs = resumed ? resumedRunLogs(id) : null;

    // Recorded now, so a failure while setting up is listed too.
    runId = id;
    try {
      recordRun(id, dirs.main, {
        workflowId: request.workflowId,
        workflowName: request.workflowName,
        log: logs?.log,
        nextflowLog: logs?.nextflowLog,
        resumedFrom: resumed?.id,
      });
    } catch (error: unknown) {
      console.warn(`Could not record run ${id}:`, error);
    }
    // Live from now, so its history doesn't call it interrupted while it is
    // set up; a cancel meanwhile stops it before Nextflow starts.
    registerRun(id, {
      stop: () => {
        cancelledInSetup = true;
      },
    });
    // Everything sent to the browser is also kept in the run's log.
    const log = fs.createWriteStream(path.join(dirs.main, logs?.log ?? RUN_LOG_FILE), {
      flags: "a",
    });
    // A full disk ends the log, not the server; the browser still gets it all.
    let logFailed = false;
    log.on("error", (error) => {
      if (!logFailed) console.warn(`Run log of ${id} can't be written:`, error);
      logFailed = true;
    });
    runLog = log;
    const send = (text: string) => {
      res.write(text);
      if (!logFailed) log.write(text);
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
    writeInputFiles(dirs.inputs, request.fileContent, request.fileEncoding);
    if (resumed) restoreNextflowMetadata(dirs);

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
      resume: Boolean(resumed),
      nextflowLog: logs?.nextflowLog,
    });
    console.log(`Executing: ${launch.command}`);
    console.log(`Working directory: ${dirs.main}`);

    res.writeHead(200, STREAM_HEADERS);
    send(`N-WAVE run: ${id}\n`);
    if (cancelledInSetup) {
      unregisterRun(id);
      send("\nExecution cancelled\n");
      recordEnd(id, "cancelled");
      log.end();
      res.end();
      return;
    }
    send(`${describeRunLimits(limits, timeoutMs)}\n`);
    if (resumed) {
      send(
        `N-WAVE: resuming run ${resumed.id}; steps whose code and inputs haven't changed are reused from its cache.\n`
      );
    } else if (request.resume) {
      send("N-WAVE: nothing to resume (no earlier run of this workflow has a cache, or one is still running); running every step.\n");
    }
    if (pipeline && raisedNextflowVersion) {
      send(
        `N-WAVE: nf-core/${pipeline.name} ${pipeline.version} needs Nextflow ${requiredNextflowVersion} or newer; this run uses ${nextflowVersion}.\n`
      );
    }

    // Runs of one pipeline get past its download one at a time.
    if (pipeline) {
      const gate = `nf-core/${pipeline.name}`;
      if (isLaunchGateBusy(gate)) {
        send(`N-WAVE: waiting for another run of ${gate} to finish downloading it.\n`);
      }
      openGate = await passLaunchGate(gate);
      if (cancelledInSetup) {
        openGate();
        unregisterRun(id);
        send("\nExecution cancelled\n");
        recordEnd(id, "cancelled");
        log.end();
        res.end();
        return;
      }
    }
    const run = startRun({
      command: launch.command,
      cwd: dirs.main,
      timeoutMs,
      containerName: launch.containerName,
      // Task containers still stopping (or orphaned when Nextflow had to be
      // killed) are removed before the run is reported as stopped.
      cleanUpAfterStop: async () => {
        const removed = await removeRunTaskContainers(path.basename(dirs.main));
        if (removed > 0) {
          send(`\nN-WAVE: removed ${removed} task container${removed === 1 ? "" : "s"} of the stopped run.\n`);
        }
      },
      onOutput: (output) => {
        console.log(`OUTPUT: ${output}`);
        if (isLaunchLine(output)) openGate();
        send(output);
      },
      onExit: (exit) => {
        openGate();
        unregisterRun(id);
        const ending = describeRunExit(exit, {
          limits,
          timeoutMs,
          runDir: dirs.main,
        });
        console.log(`Execution ${id} ${ending.status}`);
        send(ending.output);
        if (ending.status === "succeeded") moveNextflowMetadata(dirs);
        recordEnd(id, ending.status, ending.summary);
        log.end();
        res.end();
      },
    });
    registerRun(id, run);
  } catch (error: unknown) {
    console.error("Setup error:", error);
    openGate();
    const message = `Failed to setup workflow execution: ${getErrorMessage(error)}`;
    if (runId) {
      unregisterRun(runId);
      runLog?.write(`\n${message}\n`);
      recordEnd(runId, "failed", getErrorMessage(error));
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
