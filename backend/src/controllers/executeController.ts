import type { Request, Response } from "express";
import { exec } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import {
  DEFAULT_NEXTFLOW_VERSION,
  buildContainerNextflowCommand,
  buildLocalNextflowCommand,
  resolveNextflowPlatform,
  resolveOutputName,
  sanitizeWorkflowName,
  shellQuote,
  toDockerHostVisiblePath,
} from "../execution/command";
import {
  buildExecutionConfig,
  extractNwaveNextflowAssets,
  getReferencedNfCoreModules,
  getReferencedNfCoreSubworkflows,
  normalizeLegacyGeneratedScript,
  stabilizeWorkflowInvocations,
} from "../execution/nextflowScript";
import {
  findNfCoreSubworkflowDir,
  resolveNfCoreModuleDir,
} from "../execution/nfcoreModules";
import {
  ensureModulesInstalled,
  ensureSubworkflowsInstalled,
  findSubworkflowEntry,
  resolveSubworkflowComponents,
} from "../nfcore/library";
import {
  buildResourceLimitsConfig,
  describeRunLimits,
  diagnoseResourceFailure,
  formatMemory,
  resolveResourceCeiling,
  resolveRunLimits,
  resolveTimeoutMs,
} from "../execution/resources";
import { type RunHandle, startRun } from "../execution/runner";
import type { ExecutionSettings } from "../execution/types";
import { findRunResultsDir, listFiles, recordRun } from "../runs/runIndex";
import { getErrorMessage } from "../utils/errors";
import {
  cancelExecutionSchema,
  executeRequestSchema,
  type PipelineRunRequest,
} from "../validation/schemas";
import { parseBody } from "../validation/validate";

/** Docker name of a run's Nextflow runner container, so it can be stopped. */
const runnerContainerName = (executionId: string): string =>
  `nwave-run-${executionId}`;

// A simple in-memory cache to store input values temporarily
const inputCache: Record<string, Record<string, unknown>> = {};

// Track running processes for cancellation
const runningProcesses: Map<string, RunHandle> = new Map();

export const executeProcess = async (
  req: Request,
  res: Response
): Promise<void> => {
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
    await executeNextflowWorkflow(
      "",
      workflowName,
      executionSettings || {
        useDocker: true,
        containerImage,
        outputDirectory,
        outputNaming: "{workflow_name}_{timestamp}",
        maxCpus: 4,
        maxMemory: "4 GB",
        executionTimeout: 0,
        errorStrategy: "terminate",
        publishMode: "copy",
        cleanupOnFailure: true,
      },
      res,
      fileContent,
      body.pipeline
    );
    return;
  }

  // If nextflowScript is provided, execute as a full Nextflow workflow
  if (nextflowScript) {
    let normalizedNextflowScript: string;
    try {
      normalizedNextflowScript = stabilizeWorkflowInvocations(
        normalizeLegacyGeneratedScript(nextflowScript)
      );
    } catch (error: unknown) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }

    await executeNextflowWorkflow(
      normalizedNextflowScript,
      workflowName,
      executionSettings || {
        useDocker,
        containerImage,
        outputDirectory,
        outputNaming: "{workflow_name}",
        maxCpus: 4,
        maxMemory: "4 GB",
        executionTimeout: 0,
        errorStrategy: "terminate",
        publishMode: "copy",
        cleanupOnFailure: true,
      },
      res,
      fileContent
    );
    return;
  }

  // Otherwise, execute as a single process (legacy behavior). The schema
  // guarantees `script` is present when `nextflowScript` is not.
  if (inputs && inputs.length > 0 && nodeId) {
    const nodeInputs: Record<string, unknown> = {};
    for (const input of inputs) {
      nodeInputs[input.name] = input.value;
    }
    inputCache[nodeId] = nodeInputs;
  }
  executeSingleProcess(script ?? "", nodeId ?? "", useDocker, containerImage, res);
};

const executeNextflowWorkflow = async (
  nextflowScript: string,
  workflowName: string,
  executionSettings: ExecutionSettings,
  res: Response,
  fileContent?: Record<string, string>,
  pipeline?: PipelineRunRequest
): Promise<void> => {
  try {
    const sanitizedWorkflowName = sanitizeWorkflowName(workflowName);

    // Determine output directory - use user's choice or default to "results"
    const userOutputDir = executionSettings.outputDirectory || "results";
    const finalOutputName = resolveOutputName(
      executionSettings.outputNaming,
      sanitizedWorkflowName
    );

    // Create main output directory with naming pattern
    const mainOutputDir = path.isAbsolute(userOutputDir)
      ? path.join(userOutputDir, finalOutputName)
      : path.join(process.cwd(), userOutputDir, finalOutputName);

    // Create the four required subdirectories
    const workflowDir = path.join(mainOutputDir, "workflow");
    const inputsDir = path.join(mainOutputDir, "inputs");
    const resultsDir = path.join(mainOutputDir, "results");
    const nextflowDir = path.join(mainOutputDir, "nextflow");

    fs.mkdirSync(workflowDir, { recursive: true });
    fs.mkdirSync(inputsDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(nextflowDir, { recursive: true });

    console.log(`Main output directory: ${mainOutputDir}`);

    // The run's limits, clamped to what this server allows (see
    // execution/resources.ts); applied as process.resourceLimits.
    const limits = resolveRunLimits(executionSettings);
    const maxCpus = limits.cpus;
    const maxMemory = limits.memory;
    const resourceConfig = buildResourceLimitsConfig(limits);
    const timeoutMs = resolveTimeoutMs(executionSettings.executionTimeout);
    // Identifies the run for cancellation, results and the runner container.
    const executionId = `${sanitizedWorkflowName}_${Date.now()}`;

    let hasNfCoreModules: boolean;
    let shouldUseProcessDocker: boolean;
    let withModuleConfig: boolean;
    const scriptPath = path.join(workflowDir, `${sanitizedWorkflowName}.nf`);

    if (pipeline) {
      // A whole nf-core pipeline: Nextflow pulls it from GitHub; its
      // processes always run in containers (-profile docker).
      hasNfCoreModules = true;
      shouldUseProcessDocker = true;
      withModuleConfig = true;
      fs.writeFileSync(
        path.join(mainOutputDir, "nwave_modules.config"),
        `${resourceConfig}\n`
      );
      if (Object.keys(pipeline.params).length > 0) {
        fs.writeFileSync(
          path.join(mainOutputDir, "params.json"),
          `${JSON.stringify(pipeline.params, null, 2)}\n`
        );
      }
      console.log(
        `Running nf-core/${pipeline.name} ${pipeline.version} (-profile ${pipeline.profiles.join(",")})`
      );
    } else {
      const extractedNextflowAssets =
        extractNwaveNextflowAssets(nextflowScript);
      hasNfCoreModules =
        getReferencedNfCoreModules(extractedNextflowAssets.script).length > 0 ||
        getReferencedNfCoreSubworkflows(extractedNextflowAssets.script).length >
          0;
      shouldUseProcessDocker =
        executionSettings.useDocker || hasNfCoreModules;
      const nextflowConfig = `${[
        buildExecutionConfig(extractedNextflowAssets.config, shouldUseProcessDocker),
        resourceConfig,
      ]
        .filter((block) => block.trim() !== "")
        .join("\n\n")}\n`;
      withModuleConfig = true;

      // Write the Nextflow script to workflow directory
      fs.writeFileSync(scriptPath, extractedNextflowAssets.script);
      console.log(`Created workflow script: ${scriptPath}`);

      if (withModuleConfig) {
        const configPath = path.join(mainOutputDir, "nwave_modules.config");
        const workflowConfigPath = path.join(workflowDir, "nwave_modules.config");
        fs.writeFileSync(configPath, nextflowConfig);
        fs.writeFileSync(workflowConfigPath, nextflowConfig);
        console.log(`Created module config: ${configPath}`);
      }

      // Install modules the workflow uses but that aren't installed yet (e.g.
      // FastQC on a fresh install), from the catalog's pinned commit.
      await ensureModulesInstalled(
        getReferencedNfCoreModules(extractedNextflowAssets.script)
      );
      await ensureSubworkflowsInstalled(
        getReferencedNfCoreSubworkflows(extractedNextflowAssets.script)
      );
      materializeNfCoreModules(extractedNextflowAssets.script, [
        mainOutputDir,
        workflowDir,
      ]);
    }

    // Create input files in inputs directory. File names are validated by the
    // request schema to be plain names (no path separators), so they cannot
    // escape inputsDir.
    if (fileContent && Object.keys(fileContent).length > 0) {
      console.log(`Creating ${Object.keys(fileContent).length} input files...`);
      for (const [fileName, content] of Object.entries(fileContent)) {
        fs.writeFileSync(path.join(inputsDir, fileName), content);
      }
    }

    const nextflowVersion =
      executionSettings.nextflowVersion || DEFAULT_NEXTFLOW_VERSION;

    // Decide how to run Nextflow:
    //   "docker" — always run Nextflow in a container (nextflow/nextflow). The
    //              only host requirement is Docker itself; no local binary is
    //              used. This is what the Docker deployment sets, so
    //              `docker compose up` is fully self-contained on any machine.
    //   "local"  — always use a host `nextflow` binary.
    //   "auto"   — (dev default) prefer a local binary, fall back to container.
    const executionMode = (
      process.env.NEXTFLOW_EXECUTION_MODE || "auto"
    ).toLowerCase();

    const isCommandAvailable = (command: string): Promise<boolean> =>
      new Promise((resolve) => exec(command, (error) => resolve(!error)));

    let useLocalNextflow: boolean;
    if (executionMode === "docker") {
      useLocalNextflow = false;
    } else if (executionMode === "local") {
      useLocalNextflow = true;
    } else {
      useLocalNextflow = await isCommandAvailable("nextflow -version");
    }

    if (useLocalNextflow) {
      console.log(
        `Using local Nextflow with Docker processes: ${shouldUseProcessDocker}`
      );
    } else {
      // Container mode needs a reachable Docker daemon. In docker-compose the
      // host Docker socket is mounted into the backend container.
      const dockerAvailable = await isCommandAvailable("docker info");
      if (!dockerAvailable) {
        throw new Error(
          executionMode === "docker"
            ? "Cannot execute workflow: Docker is not available. Ensure the Docker socket is mounted into the backend container (see docker-compose)."
            : "Cannot execute workflow: no local Nextflow found and Docker is not running. Start Docker and try again."
        );
      }
      console.log(
        `Using Nextflow container: nextflow/nextflow:${nextflowVersion}`
      );
    }

    if (useLocalNextflow && shouldUseProcessDocker) {
      await ensureDockerAvailable(
        pipeline
          ? "nf-core pipelines run their steps in Docker containers"
          : hasNfCoreModules
          ? "nf-core modules require Docker process containers"
          : "Docker process execution is enabled"
      );
    }

    const relativeScriptPath = path.relative(mainOutputDir, scriptPath);
    const pipelineTarget = pipeline
      ? {
          name: pipeline.name,
          version: pipeline.version,
          profiles: pipeline.profiles,
          withParamsFile: Object.keys(pipeline.params).length > 0,
        }
      : undefined;
    let nextflowCmd: string;

    if (useLocalNextflow) {
      nextflowCmd = buildLocalNextflowCommand({
        scriptPath: relativeScriptPath,
        pipeline: pipelineTarget,
        withModuleConfig,
        maxCpus,
        maxMemory,
      });
    } else {
      // Use Docker Nextflow container via backend container volumes.
      const backendContainerName =
        process.env.BACKEND_CONTAINER_NAME || "nwave-backend";
      const resultsMount = await resolveContainerMount(
        backendContainerName,
        "/app/results"
      );
      const dockerResultsRoot = shouldUseProcessDocker
        ? toDockerHostVisiblePath(resultsMount.source)
        : "/app/results";
      const dockerMainOutputDir = path.posix.join(
        dockerResultsRoot,
        path.relative("/app/results", mainOutputDir).replace(/\\/g, "/")
      );
      // The Nextflow runner platform defaults to linux/amd64 (emulated on ARM
      // hosts) because many nextflow/nextflow tags are amd64-only; see
      // resolveNextflowPlatform for the "native" opt-out.
      // When process Docker is enabled, run Nextflow from a path that is also
      // visible to the host Docker daemon. Otherwise sibling task containers
      // receive empty /app/results mounts and cannot see .command.sh.
      nextflowCmd = buildContainerNextflowCommand({
        scriptPath: path.posix.join("workflow", `${sanitizedWorkflowName}.nf`),
        pipeline: pipelineTarget,
        withModuleConfig,
        maxCpus,
        maxMemory,
        platform: resolveNextflowPlatform(process.env.NEXTFLOW_PLATFORM),
        nextflowVersion,
        workDir: dockerMainOutputDir,
        containerName: runnerContainerName(executionId),
        mount: shouldUseProcessDocker
          ? {
              type: "bind",
              source: resultsMount.source,
              target: dockerResultsRoot,
            }
          : { type: "volumes-from", container: backendContainerName },
      });
    }

    console.log(`Executing: ${nextflowCmd}`);
    console.log(`Working directory: ${mainOutputDir}`);

    try {
      recordRun(executionId, mainOutputDir);
    } catch (error: unknown) {
      console.warn(`Could not record run ${executionId}:`, error);
    }

    // Set up streaming response for real-time output
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Ask proxies (nginx) not to buffer the stream, and browsers not to
      // hold back its first kilobyte to sniff the content type.
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    });
    // The frontend reads the run id to cancel the run and find its results.
    res.write(`N-WAVE run: ${executionId}\n`);
    res.write(`${describeRunLimits(limits, timeoutMs)}\n`);

    const run = startRun({
      command: nextflowCmd,
      cwd: mainOutputDir,
      timeoutMs,
      containerName: useLocalNextflow
        ? undefined
        : runnerContainerName(executionId),
      onOutput: (output) => {
        console.log(`OUTPUT: ${output}`);
        res.write(output);
      },
      onExit: ({ code, stopReason, outputTail }) => {
        runningProcesses.delete(executionId);

        if (stopReason === "cancelled") {
          console.log(`Execution ${executionId} cancelled`);
          res.write("\nExecution cancelled\n");
          res.end();
          return;
        }
        if (stopReason === "timeout") {
          const minutes = Math.max(1, Math.round(timeoutMs / 60_000));
          console.error(`Execution ${executionId} reached its time limit`);
          res.write(
            `\nN-WAVE resource problem: the run was stopped after its time limit of ${minutes} minute${minutes === 1 ? "" : "s"}. Raise Execution Timeout in the execution settings (0 uses the server default, NWAVE_EXECUTION_TIMEOUT).\n`
          );
          res.write(`Nextflow execution failed with exit code: ${code ?? "timeout"}\n`);
          res.end();
          return;
        }

        if (code !== 0) {
          console.error(
            `Execution ${executionId} failed with exit code: ${code}`
          );
          const diagnosis = diagnoseResourceFailure(outputTail, limits);
          if (diagnosis) {
            res.write(`\nN-WAVE resource problem: ${diagnosis}\n`);
          }
          res.write(`\nNextflow execution failed with exit code: ${code}\n`);
          res.end();
          return;
        }

        console.log("Nextflow execution completed successfully");
        console.log(`Results available in: ${mainOutputDir}`);

        // Send completion messages to frontend
        res.write("\nNextflow execution completed successfully\n");
        res.write(`Results available in: ${mainOutputDir}\n`);

        // Move Nextflow metadata files to nextflow directory
        const nextflowMetadataDir = path.join(mainOutputDir, ".nextflow");
        const nextflowLogFile = path.join(mainOutputDir, ".nextflow.log");
        const targetNextflowDir = path.join(nextflowDir, ".nextflow");
        const targetLogFile = path.join(nextflowDir, ".nextflow.log");

        try {
          // Move .nextflow directory if it exists
          if (fs.existsSync(nextflowMetadataDir)) {
            if (fs.existsSync(targetNextflowDir)) {
              fs.rmSync(targetNextflowDir, { recursive: true, force: true });
            }
            fs.renameSync(nextflowMetadataDir, targetNextflowDir);
            console.log("Moved .nextflow directory to nextflow/");
          }

          // Move .nextflow.log file if it exists
          if (fs.existsSync(nextflowLogFile)) {
            if (fs.existsSync(targetLogFile)) {
              fs.unlinkSync(targetLogFile);
            }
            fs.renameSync(nextflowLogFile, targetLogFile);
            console.log("Moved .nextflow.log to nextflow/");
          }
        } catch (moveError) {
          console.warn(
            "Warning: Could not move Nextflow metadata files:",
            moveError
          );
          // Don't fail the entire execution for this
        }

        console.log(`Execution ${executionId} completed successfully`);
        res.end();
      },
    });

    // Track the run for cancellation
    runningProcesses.set(executionId, run);
  } catch (error: unknown) {
    console.error("Setup error:", error);
    res.status(500).json({
      error: `Failed to setup workflow execution: ${getErrorMessage(error)}`,
    });
  }
};

const executeSingleProcess = (
  script: string,
  nodeId: string,
  useDocker: boolean,
  containerImage: string,
  res: Response
): void => {
  // Replace placeholders like $number1, $input_data with actual values
  let finalScript = script;
  const processInputs = inputCache[nodeId] || {};
  for (const key in processInputs) {
    // Basic protection against command injection, but this is NOT foolproof.
    const value = String(processInputs[key]).replace(/'/g, "'\\''");
    finalScript = finalScript.replace(
      new RegExp(`\\$${key}`, "g"),
      `'${value}'`
    );
  }

  let command: string;

  if (useDocker) {
    // Execute the script inside a Docker container
    // Mount current directory and set working directory
    const currentDir = process.cwd();
    command = `docker run --rm -v "${currentDir}:/workspace" -w /workspace ${containerImage} sh -c "${finalScript.replace(
      /"/g,
      '\\"'
    )}"`;
  } else {
    command = finalScript;
  }

  console.log(`Executing: ${command}`);

  exec(
    command,
    { timeout: 60000, maxBuffer: 1024 * 1024 },
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Execution error: ${error}`);
        res.status(500).json({
          error: stderr || "Execution failed",
          stdout: stdout,
          stderr: stderr,
        });
        return;
      }
      res.json({
        result: stdout.trim(),
        stderr: stderr,
      });
    }
  );
};

// New endpoint for checking Docker availability
export const checkDockerStatus = (_req: Request, res: Response): void => {
  // First check if Docker command exists
  exec("docker --version", (error, stdout, stderr) => {
    if (error) {
      res.json({
        dockerAvailable: false,
        error: "Docker not found",
        details: stderr,
      });
      return;
    }

    // If Docker command exists, test if Docker daemon is actually running
    exec("docker info", (daemonError, _daemonStdout, daemonStderr) => {
      if (daemonError) {
        // Check for specific Windows Docker Desktop error
        if (
          daemonStderr.includes("dockerDesktopLinuxEngine") ||
          daemonStderr.includes("pipe/docker_engine") ||
          daemonStderr.includes("cannot connect to the Docker daemon")
        ) {
          res.json({
            dockerAvailable: false,
            error: "Docker Desktop not running",
            details:
              "Docker Desktop needs to be started. Please launch Docker Desktop and try again.",
            version: stdout.trim(),
          });
          return;
        }

        res.json({
          dockerAvailable: false,
          error: "Docker daemon not accessible",
          details: daemonStderr,
          version: stdout.trim(),
        });
        return;
      }

      res.json({
        dockerAvailable: true,
        version: stdout.trim(),
      });
    });
  });
};

const ensureDockerAvailable = async (reason: string): Promise<void> => {
  try {
    await new Promise((resolve, reject) => {
      exec("docker info", (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  } catch {
    throw new Error(
      `${reason}, but Docker is not available. Please start Docker Desktop and try again.`
    );
  }
};

const resolveContainerMount = async (
  containerName: string,
  destination: string
): Promise<{ source: string; destination: string }> => {
  const mountsJson = await execOutput(
    `docker inspect ${shellQuote(containerName)} --format '{{json .Mounts}}'`
  );
  const mounts = JSON.parse(mountsJson) as Array<{
    Source?: string;
    Destination?: string;
  }>;
  const mount = mounts.find((entry) => entry.Destination === destination);

  if (!mount?.Source || !mount.Destination) {
    throw new Error(
      `Could not resolve Docker mount for ${destination} in ${containerName}`
    );
  }

  return { source: mount.Source, destination: mount.Destination };
};

const execOutput = (command: string): Promise<string> =>
  new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(stdout.trim());
    });
  });

/**
 * Copy the nf-core modules and subworkflows a script includes (with the
 * modules and subworkflows those include) into `modules/nf-core/` and
 * `subworkflows/nf-core/` under each target root.
 */
const materializeNfCoreModules = (
  script: string,
  targetRoots: string[]
): void => {
  const moduleNames = new Set(getReferencedNfCoreModules(script));
  const subworkflowNames = new Set(getReferencedNfCoreSubworkflows(script));
  for (const name of Array.from(subworkflowNames)) {
    const entry = findSubworkflowEntry(`nf-core/subworkflows/${name}`);
    if (!entry) continue;
    const components = resolveSubworkflowComponents(entry);
    for (const module of components.modules) moduleNames.add(module);
    for (const nested of components.subworkflows) subworkflowNames.add(nested);
  }

  const copies = [
    ...Array.from(moduleNames).map((name) => ({
      label: "module",
      sourceDir: resolveNfCoreModuleDir(name),
      relativeDir: path.join("modules", "nf-core", ...name.split("/")),
    })),
    ...Array.from(subworkflowNames).map((name) => {
      const sourceDir = findNfCoreSubworkflowDir(name);
      if (!sourceDir) {
        throw new Error(`nf-core subworkflow "${name}" is not installed`);
      }
      return {
        label: "subworkflow",
        sourceDir,
        relativeDir: path.join("subworkflows", "nf-core", name),
      };
    }),
  ];

  for (const { label, sourceDir, relativeDir } of copies) {
    for (const targetRoot of targetRoots) {
      const targetDir = path.join(targetRoot, relativeDir);
      const resolvedTargetRoot = path.resolve(targetRoot);
      const resolvedTargetDir = path.resolve(targetDir);
      if (!resolvedTargetDir.startsWith(`${resolvedTargetRoot}${path.sep}`)) {
        throw new Error(`Refusing to copy nf-core ${label} outside ${targetRoot}`);
      }

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.cpSync(sourceDir, targetDir, { recursive: true });
      console.log(`Materialized nf-core ${label} ${relativeDir}: ${targetDir}`);
    }
  }
};

export const cancelExecution = (req: Request, res: Response): void => {
  const body = parseBody(cancelExecutionSchema, req, res);
  if (!body) return;
  const { executionId } = body;

  const run = runningProcesses.get(executionId);

  if (run) {
    try {
      // Stops Nextflow, its tasks and its runner container; the run's
      // stream reports "Execution cancelled" once it has ended.
      run.stop("cancelled");
      res.json({
        message: "Execution cancelled successfully",
        executionId,
      });
    } catch (error: unknown) {
      console.error("Failed to cancel execution:", error);
      res.status(500).json({
        error: "Failed to cancel execution",
        details: getErrorMessage(error),
      });
    }
  } else {
    res.status(404).json({
      error: "Execution not found or already completed",
      executionId,
    });
  }
};

// New endpoint for checking Nextflow availability
export const checkNextflowStatus = (_req: Request, res: Response): void => {
  exec("nextflow -version", (error, stdout, stderr) => {
    if (error) {
      // Try with Docker-based Nextflow
      exec(
        `docker run --rm nextflow/nextflow:${DEFAULT_NEXTFLOW_VERSION} nextflow -version`,
        (dockerError, dockerStdout) => {
          if (dockerError) {
            res.json({
              nextflowAvailable: false,
              dockerNextflowAvailable: false,
              error: "Nextflow not found locally or via Docker",
              details: stderr,
            });
            return;
          }

          res.json({
            nextflowAvailable: false,
            dockerNextflowAvailable: true,
            version: dockerStdout.trim(),
            note: "Nextflow available via Docker",
          });
        }
      );
      return;
    }

    res.json({
      nextflowAvailable: true,
      dockerNextflowAvailable: true,
      version: stdout.trim(),
    });
  });
};

const parseRunId = (req: Request, res: Response): string | null => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(id)) {
    res.status(400).json({ message: "Invalid run id" });
    return null;
  }
  return id;
};

/** `{ files }`: the files in a run's results directory. */
export const listRunResultFiles = (req: Request, res: Response): void => {
  const id = parseRunId(req, res);
  if (!id) return;
  const dir = findRunResultsDir(id);
  if (!dir) {
    res.status(404).json({ message: `No results for run ${id}` });
    return;
  }
  res.json({ id, files: listFiles(dir) });
};

/**
 * One file from a run's results. HTML reports (MultiQC) are served in a
 * CSP sandbox: their scripts run, but without access to this origin.
 */
export const getRunResultFile = (req: Request, res: Response): void => {
  const id = parseRunId(req, res);
  if (!id) return;
  const dir = findRunResultsDir(id);
  const relative = typeof req.query.path === "string" ? req.query.path : "";
  const target = path.resolve(dir ?? "", relative);
  if (
    !dir ||
    !relative ||
    !target.startsWith(`${path.resolve(dir)}${path.sep}`) ||
    !fs.existsSync(target) ||
    !fs.statSync(target).isFile()
  ) {
    res.status(404).json({ message: "Result file not found" });
    return;
  }
  res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-popups");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(target);
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
