import { Request, Response } from "express";
import { exec, spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

// A simple in-memory cache to store input values temporarily
const inputCache: Record<string, any> = {};

// Track running processes for cancellation
const runningProcesses: Map<string, ChildProcess> = new Map();

interface ExecutionSettings {
  useDocker: boolean;
  containerImage: string;
  outputDirectory: string;
  outputNaming: string;
  maxCpus: number;
  maxMemory: string;
  executionTimeout: number;
  errorStrategy: string;
  publishMode: string;
  cleanupOnFailure: boolean;
  nextflowVersion?: string;
}

interface ExecuteRequest {
  script: string;
  inputs: { name: string; value: any }[];
  nodeId: string;
  useDocker?: boolean;
  containerImage?: string;
  outputDirectory?: string;
  nextflowScript?: string;
  workflowName?: string;
  fileContent?: { [filename: string]: string };
  executionSettings?: ExecutionSettings;
}

export const executeProcess = async (
  req: Request,
  res: Response
): Promise<void> => {
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
  } = req.body as ExecuteRequest;

  console.log("Execute request received:", {
    hasScript: !!script,
    hasNextflowScript: !!nextflowScript,
    useDocker,
    containerImage,
    workflowName,
  });

  if (!script && !nextflowScript) {
    res.status(400).json({ error: "Script or nextflowScript is required" });
    return;
  }

  // Store inputs in the cache, using the node ID as a key to retrieve them
  if (inputs && inputs.length > 0) {
    inputCache[nodeId] = {};
    inputs.forEach((input) => {
      inputCache[nodeId][input.name] = input.value;
    });
  }

  // If nextflowScript is provided, execute as a full Nextflow workflow
  if (nextflowScript) {
    await executeNextflowWorkflow(
      nextflowScript,
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

  // Otherwise, execute as a single process (legacy behavior)
  executeSingleProcess(script, nodeId, useDocker, containerImage, res);
};

const executeNextflowWorkflow = async (
  nextflowScript: string,
  workflowName: string,
  executionSettings: ExecutionSettings,
  res: Response,
  fileContent?: { [filename: string]: string }
): Promise<void> => {
  try {
    // Sanitize workflow name for file system
    const sanitizedWorkflowName = workflowName.replace(/[^a-zA-Z0-9_-]/g, "_");

    // Determine output directory - use user's choice or default to "results"
    const userOutputDir = executionSettings.outputDirectory || "results";
    let workingDir: string;

    if (path.isAbsolute(userOutputDir)) {
      workingDir = userOutputDir;
    } else {
      workingDir = path.join(process.cwd(), userOutputDir);
    }

    // Apply output naming pattern
    const outputNamingRaw = executionSettings.outputNaming;
    const outputNaming =
      typeof outputNamingRaw === "string" && outputNamingRaw
        ? outputNamingRaw
        : "{workflow_name}";
    const timestamp = Date.now();
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD format
    const safeSanitizedWorkflowName =
      typeof sanitizedWorkflowName === "string" && sanitizedWorkflowName
        ? sanitizedWorkflowName
        : "workflow";

    let finalOutputName = String(outputNaming);
    finalOutputName = finalOutputName.replace(
      /\{workflow_name\}/g,
      String(safeSanitizedWorkflowName)
    );
    finalOutputName = finalOutputName.replace(
      /\{timestamp\}/g,
      String(timestamp)
    );
    finalOutputName = finalOutputName.replace(/\{date\}/g, String(dateStr));
    finalOutputName = finalOutputName.replace(
      /\{process_name\}/g,
      String(safeSanitizedWorkflowName)
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
    console.log(`Workflow directory: ${workflowDir}`);
    console.log(`Inputs directory: ${inputsDir}`);
    console.log(`Results directory: ${resultsDir}`);
    console.log(`Nextflow directory: ${nextflowDir}`);

    // Build command parameters first
    const maxCpus = Math.max(1, Number(executionSettings.maxCpus) || 4);
    let maxMemory = executionSettings.maxMemory || "4GB";

    // Cap memory to 5GB for system safety
    if (
      maxMemory.includes("8GB") ||
      maxMemory.includes("16GB") ||
      maxMemory.includes("32GB")
    ) {
      maxMemory = "5GB";
      console.log(`Memory capped to 5GB for system safety`);
    }

    // For individual processes, respect their memory settings if they're lower than max
    if (maxMemory.includes("GB")) {
      const memValue = parseFloat(maxMemory.replace(/[^\d.]/g, ""));
      if (memValue > 5) {
        maxMemory = "5GB";
        console.log(`Memory capped to 5GB for system safety`);
      }
    }

    const containerImage = executionSettings.containerImage || "ubuntu:22.04";

    // Write the Nextflow script to workflow directory
    const scriptPath = path.join(workflowDir, `${sanitizedWorkflowName}.nf`);
    fs.writeFileSync(scriptPath, nextflowScript);
    console.log(`Created workflow script: ${scriptPath}`);

    // Create input files in inputs directory
    if (fileContent && Object.keys(fileContent).length > 0) {
      console.log(`Creating ${Object.keys(fileContent).length} input files...`);
      for (const [fileName, content] of Object.entries(fileContent)) {
        // Always write the file with the raw filename (with spaces, no escaping or replacement)
        const filePath = path.join(inputsDir, fileName);
        fs.writeFileSync(filePath, content);
        console.log(`Created input file: ${fileName}`);
      }
    }

    // Check if local Nextflow is available, fallback to Docker if not
    let useLocalNextflow = true;
    let nextflowVersion = executionSettings.nextflowVersion || "25.04.4";

    try {
      await new Promise((resolve, reject) => {
        exec("nextflow -version", (error) => {
          if (error) {
            reject(error);
          } else {
            resolve(true);
          }
        });
      });
      console.log(
        `Using local Nextflow with Docker processes: ${executionSettings.useDocker}`
      );
    } catch (error) {
      useLocalNextflow = false;
      console.log(`Local Nextflow not available. Using Docker Nextflow...`);

      // Check if Docker is available for fallback
      try {
        await new Promise((resolve, reject) => {
          exec("docker info", (dockerError, dockerStdout, dockerStderr) => {
            if (dockerError) {
              reject(
                new Error(
                  "Docker Desktop is not running. Please start Docker Desktop and try again."
                )
              );
            } else {
              resolve(true);
            }
          });
        });
        console.log(
          `Docker is available. Using Nextflow container: ${nextflowVersion}`
        );
      } catch (dockerError: any) {
        throw new Error(
          `Cannot execute workflow: No local Nextflow found and ${dockerError.message}`
        );
      }
    }

    // Build Nextflow command based on availability
    const scriptFile = path.join(workflowDir, `${sanitizedWorkflowName}.nf`);
    const relativeScriptPath = path.relative(mainOutputDir, scriptFile);

    let nextflowCmd: string;

    if (useLocalNextflow) {
      // Local Nextflow available - use native path separators
      // Set environment variable for log location
      const envVars = `NXF_LOG_FILE=nextflow/.nextflow.log`;
      if (executionSettings.useDocker) {
        // Enable Docker for individual process containers (not global container)
        // This allows each process to use its own container directive
        nextflowCmd = `${envVars} nextflow run ${relativeScriptPath} -with-docker --outdir results --inputdir inputs --max_cpus ${maxCpus} --max_memory "${maxMemory}" -work-dir nextflow/work`;
      } else {
        nextflowCmd = `${envVars} nextflow run ${relativeScriptPath} --outdir results --inputdir inputs --max_cpus ${maxCpus} --max_memory "${maxMemory}" -work-dir nextflow/work`;
      }
    } else {
      // Use Docker Nextflow container - convert paths to forward slashes
      const dockerMainOutputDir = mainOutputDir.replace(/\\/g, "/");
      const dockerScriptPath = relativeScriptPath.replace(/\\/g, "/");
      // Simple Docker execution - everything runs in the single Nextflow container
      nextflowCmd = `docker run --rm -e NXF_LOG_FILE=nextflow/.nextflow.log -v "${dockerMainOutputDir}:/workspace" -w /workspace nextflow/nextflow:${nextflowVersion} nextflow run ${dockerScriptPath} --outdir results --inputdir inputs --max_cpus ${maxCpus} --max_memory "${maxMemory}" -work-dir nextflow/work`;
    }

    console.log(`Executing: ${nextflowCmd}`);
    console.log(`Working directory: ${mainOutputDir}`);
    console.log(`Script path: ${relativeScriptPath}`);

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
    let allOutput = "";
    let allErrors = "";

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
        allOutput += output;

        // Send output immediately to frontend
        res.write(output);
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on("data", (data) => {
        const output = data.toString();
        console.error(`STDERR: ${output}`);
        allErrors += output;

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

      console.log(`Nextflow execution completed successfully`);
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
          console.log(`Moved .nextflow directory to nextflow/`);
        }

        // Move .nextflow.log file if it exists
        if (fs.existsSync(nextflowLogFile)) {
          if (fs.existsSync(targetLogFile)) {
            fs.unlinkSync(targetLogFile);
          }
          fs.renameSync(nextflowLogFile, targetLogFile);
          console.log(`Moved .nextflow.log to nextflow/`);
        }
      } catch (moveError) {
        console.warn(
          `Warning: Could not move Nextflow metadata files:`,
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
  } catch (error: any) {
    console.error(`Setup error:`, error);
    res.status(500).json({
      error: `Failed to setup workflow execution: ${error.message}`,
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
export const checkDockerStatus = (req: Request, res: Response): void => {
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
    exec("docker info", (daemonError, daemonStdout, daemonStderr) => {
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

// New endpoint for cancelling execution
export const cancelExecution = (req: Request, res: Response): void => {
  const { executionId } = req.body;

  if (!executionId) {
    res.status(400).json({ error: "Execution ID is required" });
    return;
  }

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
    } catch (error: any) {
      console.error("Failed to cancel execution:", error);
      res.status(500).json({
        error: "Failed to cancel execution",
        details: error.message,
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
export const checkNextflowStatus = (req: Request, res: Response): void => {
  exec("nextflow -version", (error, stdout, stderr) => {
    if (error) {
      // Try with Docker-based Nextflow
      const fallbackNextflowVersion = "25.04.4";
      exec(
        `docker run --rm nextflow/nextflow:${fallbackNextflowVersion} nextflow -version`,
        (dockerError, dockerStdout, dockerStderr) => {
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
