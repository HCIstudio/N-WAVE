import type { Request, Response } from "express";
import { exec, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import {
  DEFAULT_NEXTFLOW_VERSION,
  buildContainerNextflowCommand,
  buildLocalNextflowCommand,
  capMaxMemory,
  normalizeMaxCpus,
  resolveOutputName,
  sanitizeWorkflowName,
  shellQuote,
  toDockerHostVisiblePath,
} from "../execution/command";
import {
  buildExecutionConfig,
  extractNwaveNextflowAssets,
  getReferencedNfCoreModules,
  normalizeLegacyGeneratedScript,
  stabilizeWorkflowInvocations,
} from "../execution/nextflowScript";
import type { ExecutionSettings } from "../execution/types";
import { getErrorMessage } from "../utils/errors";
import { cancelExecutionSchema, executeRequestSchema } from "../validation/schemas";
import { parseBody } from "../validation/validate";

// A simple in-memory cache to store input values temporarily
const inputCache: Record<string, Record<string, unknown>> = {};

// Track running processes for cancellation
const runningProcesses: Map<string, ChildProcess> = new Map();

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
  fileContent?: Record<string, string>
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

    const maxCpus = normalizeMaxCpus(executionSettings.maxCpus);
    // Memory is capped for system safety.
    const maxMemory = capMaxMemory(executionSettings.maxMemory);

    const extractedNextflowAssets =
      extractNwaveNextflowAssets(nextflowScript);
    const hasNfCoreModules =
      getReferencedNfCoreModules(extractedNextflowAssets.script).length > 0;
    const shouldUseProcessDocker =
      executionSettings.useDocker || hasNfCoreModules;
    const nextflowConfig = buildExecutionConfig(
      extractedNextflowAssets.config,
      shouldUseProcessDocker
    );
    const withModuleConfig = nextflowConfig.trim() !== "";

    // Write the Nextflow script to workflow directory
    const scriptPath = path.join(workflowDir, `${sanitizedWorkflowName}.nf`);
    fs.writeFileSync(scriptPath, extractedNextflowAssets.script);
    console.log(`Created workflow script: ${scriptPath}`);

    if (withModuleConfig) {
      const configPath = path.join(mainOutputDir, "nwave_modules.config");
      const workflowConfigPath = path.join(workflowDir, "nwave_modules.config");
      fs.writeFileSync(configPath, nextflowConfig);
      fs.writeFileSync(workflowConfigPath, nextflowConfig);
      console.log(`Created module config: ${configPath}`);
    }

    materializeNfCoreModules(extractedNextflowAssets.script, [
      path.join(mainOutputDir, "modules"),
      path.join(workflowDir, "modules"),
    ]);

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
        hasNfCoreModules
          ? "nf-core modules require Docker process containers"
          : "Docker process execution is enabled"
      );
    }

    const relativeScriptPath = path.relative(mainOutputDir, scriptPath);
    let nextflowCmd: string;

    if (useLocalNextflow) {
      nextflowCmd = buildLocalNextflowCommand({
        scriptPath: relativeScriptPath,
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
      // Pin the Nextflow container to linux/amd64: the official nextflow/nextflow
      // tags are amd64-only, so on ARM hosts this runs under emulation instead
      // of failing with "no matching manifest". Overridable via NEXTFLOW_PLATFORM.
      // When process Docker is enabled, run Nextflow from a path that is also
      // visible to the host Docker daemon. Otherwise sibling task containers
      // receive empty /app/results mounts and cannot see .command.sh.
      nextflowCmd = buildContainerNextflowCommand({
        scriptPath: path.posix.join("workflow", `${sanitizedWorkflowName}.nf`),
        withModuleConfig,
        maxCpus,
        maxMemory,
        platform: process.env.NEXTFLOW_PLATFORM || "linux/amd64",
        nextflowVersion,
        workDir: dockerMainOutputDir,
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

    // Generate execution ID for tracking and cancellation
    const executionId = `${sanitizedWorkflowName}_${Date.now()}`;

    // Set up streaming response for real-time output
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Execute Nextflow with streaming output
    const childProcess = exec(nextflowCmd, {
      cwd: mainOutputDir,
      timeout:
        executionSettings.executionTimeout > 0
          ? executionSettings.executionTimeout * 60000
          : 600000, // 10 minutes default
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
    });

    // Track the process for cancellation
    runningProcesses.set(executionId, childProcess);

    // Stream output in real-time
    if (childProcess.stdout) {
      childProcess.stdout.on("data", (data) => {
        const output = data.toString();
        console.log(`STDOUT: ${output}`);

        // Send output immediately to frontend
        res.write(output);
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on("data", (data) => {
        const output = data.toString();
        console.error(`STDERR: ${output}`);

        // Send stderr to frontend as well
        res.write(output);
      });
    }

    // Handle process completion
    childProcess.on("close", (code) => {
      // Remove from tracking when process completes
      runningProcesses.delete(executionId);

      if (code !== 0) {
        console.error(
          `Execution ${executionId} failed with exit code: ${code}`
        );
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
    });

    childProcess.on("error", (error) => {
      // Remove from tracking
      runningProcesses.delete(executionId);

      console.error(`Execution ${executionId} failed with error:`, error);
      res.write(`\nExecution error: ${error.message}\n`);
      res.end();
    });
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

const materializeNfCoreModules = (
  script: string,
  targetModuleRoots: string[]
): void => {
  const moduleNames = getReferencedNfCoreModules(script);
  if (moduleNames.length === 0) return;

  for (const moduleName of moduleNames) {
    const sourceDir = resolveNfCoreModuleSourceDir(moduleName);

    for (const targetRoot of targetModuleRoots) {
      const targetDir = path.join(targetRoot, "nf-core", ...moduleName.split("/"));
      const resolvedTargetRoot = path.resolve(targetRoot);
      const resolvedTargetDir = path.resolve(targetDir);
      if (!resolvedTargetDir.startsWith(resolvedTargetRoot)) {
        throw new Error(`Refusing to copy nf-core module outside ${targetRoot}`);
      }

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.cpSync(sourceDir, targetDir, { recursive: true });
      console.log(`Materialized nf-core module ${moduleName}: ${targetDir}`);
    }
  }
};

const resolveNfCoreModuleSourceDir = (moduleName: string): string => {
  const sourceRoots = [
    ...resolveInstalledNfCoreModuleRoots(),
    ...resolveBundledNfCoreModuleRoots(),
  ];
  const sourceDir = sourceRoots
    .map((sourceRoot) => path.join(sourceRoot, ...moduleName.split("/")))
    .find((candidate) => fs.existsSync(candidate));

  if (!sourceDir) {
    throw new Error(
      `nf-core module "${moduleName}" is not installed or bundled. Checked roots: ${sourceRoots.join(", ")}`
    );
  }

  return sourceDir;
};

const resolveInstalledNfCoreModuleRoots = (): string[] => {
  const dataRoot = path.resolve(
    process.env.NWAVE_DATA_DIR || path.join(process.cwd(), "results", ".nwave")
  );
  const installedRoot = path.join(dataRoot, "nf-core", "modules", "nf-core");
  return fs.existsSync(installedRoot) ? [installedRoot] : [];
};

const resolveBundledNfCoreModuleRoots = (): string[] => {
  const candidates = [
    path.join(
      process.cwd(),
      "dist",
      "workflows",
      "library",
      "assets",
      "nf-core",
      "modules",
      "nf-core"
    ),
    path.join(
      process.cwd(),
      "src",
      "workflows",
      "library",
      "assets",
      "nf-core",
      "modules",
      "nf-core"
    ),
  ];

  return candidates.filter((candidate) => fs.existsSync(candidate));
};

export const cancelExecution = (req: Request, res: Response): void => {
  const body = parseBody(cancelExecutionSchema, req, res);
  if (!body) return;
  const { executionId } = body;

  const childProcess = runningProcesses.get(executionId);

  if (childProcess) {
    try {
      // Kill the process and all its children
      if (childProcess.pid) {
        // On Windows, use taskkill to kill the process tree
        if (process.platform === "win32") {
          exec(`taskkill /pid ${childProcess.pid} /t /f`, (error) => {
            if (error) {
              console.warn(`Failed to kill process tree: ${error.message}`);
            }
          });
        } else {
          // On Unix-like systems, kill the process group
          childProcess.kill("SIGTERM");
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill("SIGKILL");
            }
          }, 5000);
        }
      }

      runningProcesses.delete(executionId);

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
