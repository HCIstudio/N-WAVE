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
    const normalizedNextflowScript = stabilizeWorkflowInvocations(
      normalizeLegacyGeneratedScript(nextflowScript)
    );
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
    const moduleConfigOption = nextflowConfig.trim()
      ? "-c nwave_modules.config "
      : "";

    // Write the Nextflow script to workflow directory
    const scriptPath = path.join(workflowDir, `${sanitizedWorkflowName}.nf`);
    fs.writeFileSync(scriptPath, extractedNextflowAssets.script);
    console.log(`Created workflow script: ${scriptPath}`);

    if (nextflowConfig.trim()) {
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
        `Using local Nextflow with Docker processes: ${shouldUseProcessDocker}`
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

    if (useLocalNextflow && shouldUseProcessDocker) {
      await ensureDockerAvailable(
        hasNfCoreModules
          ? "nf-core modules require Docker process containers"
          : "Docker process execution is enabled"
      );
    }

    // Build Nextflow command based on availability
    const scriptFile = path.join(workflowDir, `${sanitizedWorkflowName}.nf`);
    const relativeScriptPath = path.relative(mainOutputDir, scriptFile);

    let nextflowCmd: string;

    if (useLocalNextflow) {
      // Local Nextflow available - use native path separators
      // Set environment variable for log location
      const envVars = `NXF_LOG_FILE=nextflow/.nextflow.log`;
      nextflowCmd = `${envVars} nextflow -log nextflow/.nextflow.log ${moduleConfigOption}run ./${relativeScriptPath} --outdir results --inputdir inputs --max_cpus ${maxCpus} --max_memory "${maxMemory}" -work-dir nextflow/work`;
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
      const dockerMainOutputDir = path
        .posix
        .join(dockerResultsRoot, path.relative("/app/results", mainOutputDir).replace(/\\/g, "/"));
      const dockerScriptPath = path
        .posix
        .relative(dockerMainOutputDir, path.posix.join(dockerMainOutputDir, "workflow", `${sanitizedWorkflowName}.nf`));
      const nextflowRunnerMount = shouldUseProcessDocker
        ? `-v ${shellQuote(`${resultsMount.source}:${dockerResultsRoot}`)}`
        : `--volumes-from ${shellQuote(backendContainerName)}`;
      // When process Docker is enabled, run Nextflow from a path that is also
      // visible to the host Docker daemon. Otherwise sibling task containers
      // receive empty /app/results mounts and cannot see .command.sh.
      nextflowCmd = `docker run --rm ${nextflowRunnerMount} -v /var/run/docker.sock:/var/run/docker.sock -e NXF_LOG_FILE=nextflow/.nextflow.log -w ${shellQuote(dockerMainOutputDir)} nextflow/nextflow:${nextflowVersion} nextflow -log nextflow/.nextflow.log ${moduleConfigOption}run ./${dockerScriptPath} --outdir results --inputdir inputs --max_cpus ${maxCpus} --max_memory "${maxMemory}" -work-dir nextflow/work`;
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

const buildExecutionConfig = (
  generatedConfig: string,
  enableDocker: boolean
): string => {
  const configBlocks = [generatedConfig.trim()].filter(Boolean);

  if (enableDocker) {
    configBlocks.push(
      [
        "docker {",
        "  enabled = true",
        "}",
        "",
        "process {",
        "  executor = 'local'",
        "}",
      ].join("\n")
    );
  }

  return configBlocks.join("\n\n");
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

const toDockerHostVisiblePath = (hostPath: string): string => {
  const windowsPathMatch = hostPath.match(/^([A-Za-z]):\\(.*)$/);
  if (!windowsPathMatch) {
    return hostPath.replace(/\\/g, "/");
  }

  const drive = windowsPathMatch[1]!.toLowerCase();
  const rest = windowsPathMatch[2]!.replace(/\\/g, "/");
  return `/run/desktop/mnt/host/${drive}/${rest}`;
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

const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;

const extractNwaveNextflowAssets = (
  script: string
): { script: string; config: string } => {
  const configBlocks: string[] = [];
  const cleanedScript = script.replace(
    /\/\*\s*N-WAVE_NEXTFLOW_CONFIG\s*([\s\S]*?)\*\//g,
    (_match, configBlock: string) => {
      configBlocks.push(configBlock.trim());
      return "";
    }
  );

  return {
    script: cleanedScript,
    config: configBlocks.filter(Boolean).join("\n\n"),
  };
};

const normalizeLegacyGeneratedScript = (script: string): string => {
  assertNoLegacyBioinformaticsTemplates(script);

  let normalizedScript = addLegacyFileInputAliases(script);
  normalizedScript = addLegacyProcessOutputAliases(normalizedScript);
  return normalizedScript;
};

const assertNoLegacyBioinformaticsTemplates = (script: string): void => {
  if (
    script.includes("Installing FastQC dependencies") ||
    script.includes("Downloading FastQC") ||
    script.includes("Downloading Trimmomatic") ||
    script.includes("trimmomatic-0.39.jar")
  ) {
    throw new Error(
      "Generated workflow uses a legacy inline FastQC/Trimmomatic template. " +
        "The frontend is not using the current nf-core node generator. " +
        "Rebuild and restart the frontend container/dev server, then create a new FastQC/Trimmomatic node."
    );
  }
};

const addLegacyFileInputAliases = (script: string): string => {
  if (!/\bch_files\b/.test(script)) return script;

  const referencedAliases = Array.from(
    new Set(
      [...script.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*_ch_files_out)\b/g)].map(
        (match) => match[1]
      )
    )
  ).filter(
    (alias): alias is string => Boolean(alias)
  ).filter(
    (alias) =>
      !new RegExp(`^\\s*${escapeRegExp(alias)}\\s*=`, "m").test(script)
  );

  if (referencedAliases.length === 0) return script;

  const aliasBlock = referencedAliases
    .map((alias) => `${alias} = ch_files`)
    .join("\n");

  const workflowIndex = script.indexOf("\nworkflow {");
  if (workflowIndex === -1) {
    return `${script}\n\n${aliasBlock}\n`;
  }

  return `${script.slice(0, workflowIndex)}\n${aliasBlock}\n${script.slice(
    workflowIndex
  )}`;
};

const addLegacyProcessOutputAliases = (script: string): string => {
  const aliasLines: string[] = [];
  const tupleAssignmentPattern =
    /^\s*\(([^)]+)\)\s*=\s*[A-Za-z_][A-Za-z0-9_]*\s*\(/gm;
  let match: RegExpExecArray | null;

  while ((match = tupleAssignmentPattern.exec(script)) !== null) {
    const assignedVars = match[1]
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    assignedVars?.forEach((assignedVar) => {
      const aliasMatch = assignedVar.match(
        /^(?:[A-Za-z0-9]+_)?node_([0-9]+)_(.+)$/
      );
      if (!aliasMatch) return;

      const alias = `node_${aliasMatch[1]}_${aliasMatch[2]}`;
      if (alias === assignedVar) return;
      if (!new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(script)) return;
      if (new RegExp(`^\\s*${escapeRegExp(alias)}\\s*=`, "m").test(script)) {
        return;
      }

      aliasLines.push(`    ${alias} = ${assignedVar}`);
    });
  }

  const uniqueAliasLines = Array.from(new Set(aliasLines));
  if (uniqueAliasLines.length === 0) return script;

  return script.replace(
    /^(\s*\([^)]+\)\s*=\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^\n]*\)\s*)$/m,
    `$1\n${uniqueAliasLines.join("\n")}`
  );
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const materializeNfCoreModules = (
  script: string,
  targetModuleRoots: string[]
): void => {
  const moduleNames = getReferencedNfCoreModules(script);
  if (moduleNames.length === 0) return;

  moduleNames.forEach((moduleName) => {
    const sourceDir = resolveNfCoreModuleSourceDir(moduleName);

    targetModuleRoots.forEach((targetRoot) => {
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
    });
  });
};

const getReferencedNfCoreModules = (script: string): string[] => {
  const modules = new Set<string>();
  const includePattern =
    /from\s+['"]\.\/modules\/nf-core\/([A-Za-z0-9_/-]+)\/main['"]/g;
  let match: RegExpExecArray | null;

  while ((match = includePattern.exec(script)) !== null) {
    const moduleName = match[1];
    if (!moduleName) {
      continue;
    }
    if (
      !/^[A-Za-z0-9_/-]+$/.test(moduleName) ||
      moduleName.split("/").some((segment) => !segment || segment === "..")
    ) {
      throw new Error(`Invalid nf-core module name: ${moduleName}`);
    }
    modules.add(moduleName);
  }

  return Array.from(modules);
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

// New endpoint for cancelling execution
const stabilizeWorkflowInvocations = (script: string): string => {
  if (script.includes("N-WAVE generator: registry-nfcore-v1")) {
    return script;
  }

  const lines = script.split(/\r?\n/);
  const workflowStart = lines.findIndex((line) => line.trim() === "workflow {");
  const workflowEnd = lines.lastIndexOf("}");
  if (workflowStart === -1 || workflowEnd <= workflowStart) return script;

  const header = lines.slice(0, workflowStart + 1);
  const workflowBody = lines.slice(workflowStart + 1, workflowEnd);
  const footer = lines.slice(workflowEnd);

  const isTrackedVariable = (name: string): boolean =>
    name.startsWith("ch_") || name.startsWith("node_");

  const variableDefinitions = new Map<string, string>();

  // Variables defined outside workflow scope (e.g. Channel declarations) are valid
  // inputs for workflow invocations and must be included in the dependency graph.
  lines
    .slice(0, workflowStart)
    .forEach((line) => {
      const trimmed = line.trim();
      const declarationMatch = trimmed.match(
        /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*.+$/
      );
      if (!declarationMatch) return;

      const declaredName = declarationMatch[1] ?? "";
      const declaration = sanitizeVarName(declaredName);
      if (declaration && isTrackedVariable(declaration)) {
        variableDefinitions.set(declaration, line);
      }
    });

  const invocationRecords: Array<{
    text: string;
    definitions: string[];
    usages: string[];
    isCommentOrEmpty: boolean;
  }> = [];
  const otherLines: string[] = [];
  const headerDefinedVariables = new Set(variableDefinitions.keys());
  let skipNextChainedLine = false;
  let skipDuplicateChannelLine = false;

  const invocationRegex = /\(.*\)/;

  workflowBody.forEach((line) => {
    const trimmed = line.trim();
    if (skipDuplicateChannelLine) {
      if (trimmed.startsWith(".")) {
        return;
      }
      skipDuplicateChannelLine = false;
    }

    if (trimmed === "" || trimmed.startsWith("//")) {
      otherLines.push(line);
      if (!trimmed) {
        skipNextChainedLine = false;
      }
      return;
    }

    if (skipNextChainedLine) {
      if (trimmed.startsWith(".")) {
        return;
      }
      skipNextChainedLine = false;
    }

    const isChannelDeclaration = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*Channel\./.test(
      trimmed
    );
    if (isChannelDeclaration) {
      skipDuplicateChannelLine = true;
      return;
    }

    const { definitions, usages } = parseWorkflowInvocation(line);
    if (
      definitions.length > 0 ||
      usages.length > 0 ||
      invocationRegex.test(trimmed)
    ) {
      invocationRecords.push({
        text: line,
        definitions,
        usages,
        isCommentOrEmpty: false,
      });
    } else {
      otherLines.push(line);
    }
  });

  const variableUsages = new Map<string, string[]>();

  invocationRecords.forEach((record) => {
    record.definitions.forEach((definition) => {
      if (isTrackedVariable(definition)) {
        variableDefinitions.set(definition, record.text);
      }
    });
    record.usages.forEach((usedVar) => {
      if (!isTrackedVariable(usedVar)) return;
      if (!variableUsages.has(usedVar)) {
        variableUsages.set(usedVar, []);
      }
      variableUsages.get(usedVar)!.push(record.text);
    });
  });

  const sortedInvocations: string[] = [];
  const processed = new Set<string>();
  const processing = new Set<string>();

  const addInvocation = (invocationText: string): void => {
    if (processed.has(invocationText)) return;
    if (processing.has(invocationText)) return;

    processing.add(invocationText);
    const record = invocationRecords.find((r) => r.text === invocationText);
    if (record) {
      record.usages.forEach((usedVar) => {
        const definingInvocation = variableDefinitions.get(usedVar);
        if (definingInvocation && !processed.has(definingInvocation)) {
          addInvocation(definingInvocation);
        }
      });
    }

    processing.delete(invocationText);
    if (!sortedInvocations.includes(invocationText)) {
      sortedInvocations.push(invocationText);
    }
    processed.add(invocationText);
  };

  invocationRecords.forEach((record) => addInvocation(record.text));

  variableUsages.forEach((dependents, variable) => {
    if (!variableDefinitions.has(variable)) {
      console.warn(
        `Could not resolve workflow variable "${variable}" used in: ${dependents.join(
          " | "
        )}. Treating as external input.`
      );
    }
  });

  const workflowOutput = [
    ...otherLines.filter(
      (line) => line.trim() === "" || line.trim().startsWith("//")
    ),
    ...sortedInvocations,
  ];
  const workflowOutputLines = workflowOutput.join("\n").split(/\r?\n/);

  const sanitizedWorkflowOutput: string[] = [];
  let skipChannelDeclarationContinuation = false;
  for (const line of workflowOutputLines) {
    const trimmed = line.trim();

    if (skipChannelDeclarationContinuation) {
      if (trimmed.startsWith(".")) {
        continue;
      }
      skipChannelDeclarationContinuation = false;
    }

    const isChannelDeclaration =
      /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*Channel\./.test(trimmed);
    const isChannelFromList = trimmed.includes("Channel.fromList(");
    if (isChannelDeclaration || isChannelFromList) {
      skipChannelDeclarationContinuation = true;
      continue;
    }

    if (trimmed.startsWith(".")) {
      continue;
    }

    sanitizedWorkflowOutput.push(line);
  }

  return [...header, ...sanitizedWorkflowOutput, ...footer].join("\n");
};

const parseWorkflowInvocation = (line: string): {
  definitions: string[];
  usages: string[];
} => {
  const definitions: string[] = [];
  const usages: string[] = [];
  const trimmed = line.trim();

  const tupleDefinitionMatch = trimmed.match(/^\(\s*([^)]+?)\s*\)\s*=\s*\w+\(/);
  if (tupleDefinitionMatch) {
    const tupleDefs = tupleDefinitionMatch[1];
    if (tupleDefs) {
      tupleDefs
      .split(",")
      .map((name) => sanitizeVarName(name.trim()))
      .filter(Boolean)
          .forEach((name) => {
            if (
              name.startsWith("ch_") ||
              name.startsWith("node_")
            ) {
              definitions.push(name);
            }
          });
    }
  } else {
    const definitionMatch = trimmed.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (definitionMatch) {
      const definitionName = definitionMatch[1] ?? "";
      const name = sanitizeVarName(definitionName);
      if (
        name &&
        (name.startsWith("ch_") || name.startsWith("node_"))
      ) {
        definitions.push(name);
      }
    }
  }

  getInvocationArguments(line).forEach((arg) => {
    if (!usages.includes(arg)) usages.push(arg);
  });

  return { definitions, usages };
};

const getInvocationArguments = (line: string): string[] => {
  const trimmed = line.trim();
  const assignmentIndex = trimmed.indexOf("=");
  const rhs = assignmentIndex === -1 ? trimmed : trimmed.substring(assignmentIndex + 1);
  const candidatePattern = /\b[A-Za-z_][A-Za-z0-9_]*(?:_[A-Za-z0-9_]+)*\b/g;
  const lhsDefinitions = new Set<string>();
  const tupleDefinitionMatch = trimmed.match(/^\(\s*([^)]+?)\s*\)\s*=\s*\w+\(/);
  const tupleDefinitions = tupleDefinitionMatch?.[1];
  if (tupleDefinitions) {
    tupleDefinitions
      .split(",")
      .map((name) => sanitizeVarName(name.trim()))
      .filter(Boolean)
      .forEach((name) => lhsDefinitions.add(name));
  } else {
    const definitionMatch = trimmed.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const definitionName = definitionMatch?.[1];
    if (definitionName) {
      lhsDefinitions.add(sanitizeVarName(definitionName));
    }
  }

  const args: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = candidatePattern.exec(rhs)) !== null) {
    const rawName = match[0];
    const arg = sanitizeVarName(rawName);
    if (!arg || lhsDefinitions.has(arg)) {
      continue;
    }

    const startIndex = match.index;
    const endIndex = startIndex + rawName.length;
    const previousChar = startIndex > 0 ? rhs.charAt(startIndex - 1) : "";
    const nextNonWhitespaceChar =
      rhs.slice(endIndex).match(/^\s*(.)/)?.[1] ?? "";

    if (previousChar === ".") {
      continue;
    }

    if (nextNonWhitespaceChar === "(") {
      continue;
    }

    if (
      (arg.startsWith("ch_") || arg.startsWith("node_")) &&
      !args.includes(arg)
    ) {
      args.push(arg);
    }
  }

  return args;
};

const sanitizeVarName = (name: string): string => {
  if (typeof name !== "string") return "";
  let sanitized = name.replace(/[-\\s]+/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `v_${sanitized}`;
  }
  return sanitized;
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
