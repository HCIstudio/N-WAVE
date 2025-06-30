import type { Node, Edge } from "reactflow";
import {
  generateProcessCode,
  generateOperatorCode,
  generateOutputCode,
} from "./templateEngine";

/**
 * Generates a Nextflow script from the current workflow nodes.
 *
 * This function has been refactored to use the template system for clean,
 * error-free script generation. Complex inline string building has been
 * replaced with calls to specialized template functions:
 *
 * - Process nodes (FastQC, Trimmomatic, Generic) → generateProcessCode()
 * - Operator nodes (Filter, Map, Merge) → generateOperatorCode()
 * - Output nodes → generateOutputCode()
 * - File inputs remain inline (simple, no escaping issues)
 *
 * @param nodes An array of nodes from the React Flow instance.
 * @param edges An array of edges from the React Flow instance.
 * @param workflowName The name of the workflow.
 * @param outputDirectory The output directory for the workflow.
 * @param outputNamingPattern The output naming pattern for the workflow.
 * @returns A string containing the generated Nextflow script.
 */
export const generateNextflowScript = (
  nodes: Node[],
  edges: Edge[],
  workflowName: string,
  outputDirectory: string,
  outputNamingPattern: string
): string => {
  // Add timestamp to ensure unique process names
  const timestamp = Date.now();
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

  // Convert outputDirectory to use forward slashes for Nextflow compatibility
  const nfOutputDirectory = outputDirectory.replace(/\\/g, "/");

  let paramsScript = `params.outdir = '${nfOutputDirectory}'\n\n`;
  let firstPassScript = "";
  const processScripts: { [key: string]: string } = {};
  const executionOrder: string[] = [];
  const channelNameMap = new Map<string, string>();

  // Counter for output display nodes to ensure unique filenames
  let outputDisplayCounter = 1;
  const channelDefinitions: string[] = [];
  const processInvocations: string[] = [];

  // First pass: Define file inputs and map all node outputs to channel names
  nodes.forEach((node) => {
    if (node.type === "fileInput") {
      const channelName = "ch_files";
      channelNameMap.set(`${node.id}.ch_files_out`, channelName);

      // Extract selected filenames from the node data
      const selectedFiles = node.data.files || [];
      const filenames = selectedFiles.map(
        (file: any) => file.name || file.originalName || "unknown_file"
      );

      if (filenames.length > 0) {
        // Add parameters for input directory and selected files
        paramsScript += `params.inputdir = "./inputs"\n`;
        paramsScript += `params.selected_files = [${filenames
          .map((name: string) => `'${name}'`)
          .join(", ")}]\n\n`;

        // Create channel from file list with proper file staging
        firstPassScript += `${channelName} = Channel.fromList(params.selected_files)\n`;
        firstPassScript += `    .map { filename -> file("\${params.inputdir}/\${filename}") }\n\n`;
      } else {
        // Fallback if no files
        paramsScript += `params.inputdir = "./inputs"\n`;
        paramsScript += `params.selected_files = []\n\n`;
        firstPassScript += `${channelName} = Channel.empty()\n\n`;
      }
    } else {
      node.data.outputs?.forEach((output: { name: string }) => {
        // Use the actual output name for better mapping, especially for processes like FastQC
        const channelName = `${node.id.replace(/[\s-]+/g, "_")}_${output.name}`;
        channelNameMap.set(`${node.id}.${output.name}`, channelName);
      });

      // Also create a fallback mapping for generic output handles that might use different naming
      if (node.data.outputs && node.data.outputs.length > 0) {
        // Map common output handle patterns
        const firstOutputName = node.data.outputs[0].name;
        const fallbackChannelName = `${node.id.replace(
          /[\s-]+/g,
          "_"
        )}_${firstOutputName}`;

        // Add mappings for common handle naming patterns
        channelNameMap.set(`${node.id}.out`, fallbackChannelName);
        channelNameMap.set(`${node.id}_out`, fallbackChannelName);
        channelNameMap.set(`${node.id}.output`, fallbackChannelName);
      }
    }
  });

  // Track which process nodes have already been invoked
  const invokedNodes = new Set<string>();

  // Second pass: Build operator chains and process blocks
  const processedNodes = new Set<string>();
  nodes.forEach((node) => {
    if (processedNodes.has(node.id)) return;
    processedNodes.add(node.id);

    if (
      node.type === "operator" ||
      node.type === "filter" ||
      node.type === "process" ||
      node.type === "outputDisplay"
    ) {
      if (invokedNodes.has(node.id)) return;
      invokedNodes.add(node.id);
      // Robust process name generation
      let type = node.data.processType || node.data.operatorType || node.type;
      if (!type || typeof type !== "string" || type === "undefined")
        type = "process";
      const processName = `${type}_${node.id.replace(/[\s-]+/g, "_")}`;

      const upstreamEdge = edges.find((edge) => edge.target === node.id);
      if (!upstreamEdge) return;

      let upstreamChannelName = channelNameMap.get(
        `${upstreamEdge.source}.${upstreamEdge.sourceHandle}`
      );
      if (!upstreamChannelName) {
        // Try alternative mapping patterns if the direct lookup failed
        let alternativeChannelName = null;

        // Pattern 1: sourceHandle might be "nodeId_outputName" - extract the output name
        if (
          upstreamEdge.sourceHandle &&
          upstreamEdge.sourceHandle.includes("_")
        ) {
          const outputName = upstreamEdge.sourceHandle.split("_").pop();
          alternativeChannelName = channelNameMap.get(
            `${upstreamEdge.source}.${outputName}`
          );
        }

        // Pattern 2: sourceHandle might be just "out" - try default output
        if (!alternativeChannelName && upstreamEdge.sourceHandle) {
          alternativeChannelName = channelNameMap.get(
            `${upstreamEdge.source}.${upstreamEdge.sourceHandle}`
          );
        }

        // Pattern 3: Use the first available output from this source node
        if (!alternativeChannelName) {
          for (const [key, value] of channelNameMap.entries()) {
            if (key.startsWith(`${upstreamEdge.source}.`)) {
              alternativeChannelName = value;
              console.warn(
                `Using fallback channel mapping: ${key} -> ${value}`
              );
              break;
            }
          }
        }

        if (alternativeChannelName) {
          // Use the alternative mapping
          upstreamChannelName = alternativeChannelName;
          console.warn(
            `Using alternative channel mapping for ${upstreamEdge.source}.${upstreamEdge.sourceHandle} -> ${alternativeChannelName}`
          );
        } else {
          console.warn(
            `No upstream channel found for ${upstreamEdge.source}.${upstreamEdge.sourceHandle}`
          );
          console.warn(
            "Available channel mappings:",
            Array.from(channelNameMap.entries())
          );
          return;
        }
      }

      // Output display nodes don't have outputs, so skip this check for them
      let outputChannelName = null;
      if (node.type !== "outputDisplay") {
        // For processes with multiple outputs (like FastQC), we'll handle them specially
        // Skip the early return check for FastQC since it handles outputs differently
        if (node.data.processType !== "fastqc") {
          outputChannelName = channelNameMap.get(
            `${node.id}.${node.data.outputs[0].name}`
          );
          if (!outputChannelName) return;
        }
      }

      if (node.type === "operator" || node.type === "filter") {
        // Handle backward compatibility: old filter nodes had type: "filter"
        // New nodes have type: "operator" with operatorType field
        const operatorType =
          node.type === "filter" ? "filter" : node.data.operatorType;

        if (operatorType === "filter") {
          const filterText = node.data.filterText || "";
          const filterMode = node.data.filterMode || "contains";
          const filterNegate = node.data.filterNegate || false;
          const selectedFiles = node.data.selectedFilterFiles || [];
          const containerImage = node.data.containerImage || "ubuntu:22.04";
          const cpus = node.data.cpus || 1;
          const memory = node.data.memory || "2.GB";

          // Use template for clean filter generation
          processScripts[node.id] = generateOperatorCode("filter", {
            processName,
            cpuCount: cpus,
            memoryAmount: memory,
            containerImage,
            filterText,
            filterMode,
            filterNegate,
          });

          executionOrder.push(node.id);

          // If specific files are selected, filter by filename first
          if (selectedFiles.length > 0) {
            const selectedFileNames = selectedFiles.map((f: any) => f.name);
            const fileNameFilter = selectedFileNames
              .map((name: string) => `file.name == '${name}'`)
              .join(" || ");

            channelDefinitions.push(
              `    // Filter to only process selected files: ${selectedFileNames.join(
                ", "
              )}\n`
            );
            channelDefinitions.push(
              `    ${outputChannelName}_selected = ${upstreamChannelName}.filter { file -> ${fileNameFilter} }\n`
            );
            processInvocations.push(
              `    ${outputChannelName} = ${processName}(${outputChannelName}_selected)\n`
            );
          } else {
            // Process all files if none specifically selected
            processInvocations.push(
              `    ${outputChannelName} = ${processName}(${upstreamChannelName})\n`
            );
          }
        } else if (operatorType === "map") {
          const mapOperation = node.data.mapOperation || "changeCase";
          const containerImage = node.data.containerImage || "ubuntu:22.04";
          const cpus = node.data.cpus || 1;
          const memory = node.data.memory || "2.GB";

          // Use template for clean map generation
          processScripts[node.id] = generateOperatorCode("map", {
            processName,
            cpuCount: cpus,
            memoryAmount: memory,
            containerImage,
            mapOperation,
            mapChangeCase: node.data.mapChangeCase,
            mapReplaceFind: node.data.mapReplaceFind,
            mapReplaceWith: node.data.mapReplaceWith,
          });

          executionOrder.push(node.id);

          // Add process invocation
          processInvocations.push(
            `    ${outputChannelName} = ${processName}(${upstreamChannelName})\n`
          );
        } else if (operatorType === "merge") {
          const mergeOperation = node.data.mergeOperation || "join";
          const containerImage = node.data.containerImage || "ubuntu:22.04";
          const cpus = node.data.cpus || 1;
          const memory = node.data.memory || "2.GB";

          if (mergeOperation === "join") {
            const mergeTemplate = generateOperatorCode("merge", {
              processName,
              cpuCount: cpus,
              memoryAmount: memory,
              containerImage,
              mergeOperation: "join",
              joinType: node.data.joinType || "txt",
            } as any);

            processScripts[node.id] = mergeTemplate;
            executionOrder.push(node.id);
            processInvocations.push(
              `    ${outputChannelName} = ${processName}(${upstreamChannelName}.collect())\n`
            );
          }
        }
      } else if (node.type === "process") {
        // Generate process script based on process type
        const processType = node.data.processType || "generic";

        if (processType === "fastqc") {
          // Generate FastQC process with node settings
          const fastqcOptions = node.data.fastqcOptions || "";
          const containerImage = node.data.containerImage || "ubuntu:22.04";
          const cpus = node.data.cpus || 1;
          const memory = node.data.memory || "2.GB";

          processScripts[node.id] = generateProcessCode("fastqc", {
            processName,
            cpuCount: cpus,
            memoryAmount: memory,
            containerImage,
            fastqcOptions,
          });
        } else if (processType === "trimmomatic") {
          // Generate Trimmomatic process with node settings
          // Build params string from node data
          const trimmomaticParamsArr = [
            `LEADING:${node.data.leading ?? 3}`,
            `TRAILING:${node.data.trailing ?? 3}`,
            `SLIDINGWINDOW:${node.data.slidingwindow ?? "4:15"}`,
            `MINLEN:${node.data.minlen ?? 36}`,
          ];
          if (node.data.adapter_file && node.data.adapter_file.trim() !== "") {
            trimmomaticParamsArr.push(`ILLUMINACLIP:${node.data.adapter_file}`);
          }
          if (node.data.custom_steps && node.data.custom_steps.trim() !== "") {
            // Allow multiple custom steps, one per line
            const steps = node.data.custom_steps
              .split("\n")
              .map((s: string) => s.trim())
              .filter(Boolean);
            trimmomaticParamsArr.push(...steps);
          }
          // (phred_score is not used in the script, as -phred33 is hardcoded)
          const trimmomaticParams = trimmomaticParamsArr.join(" ");
          const containerImage = node.data.containerImage || "ubuntu:22.04";
          const cpus = node.data.cpus || 1;
          const memory = node.data.memory || "2.GB";

          processScripts[node.id] = generateProcessCode("trimmomatic", {
            processName,
            cpuCount: cpus,
            memoryAmount: memory,
            containerImage,
            trimmomaticParams,
          });
        } else {
          // Generate generic process with node settings
          const script = node.data.script || '"""\necho "Hello World"\n"""';
          const containerImage = node.data.containerImage || "ubuntu:22.04";
          const cpus = node.data.cpus || 1;
          const memory = node.data.memory || "2.GB";
          const timeLimit = node.data.timeLimit || "1.h";

          processScripts[node.id] = generateProcessCode("generic", {
            processName,
            cpuCount: cpus,
            memoryAmount: memory,
            containerImage,
            script,
            timeLimit,
          });
        }

        executionOrder.push(node.id);

        let inputChannels = "";
        const incomingEdges = edges.filter((e) => e.target === node.id);
        if (incomingEdges.length > 0) {
          inputChannels = incomingEdges
            .map((e) =>
              sanitizeVarName(`${e.source}_${e.sourceHandle || "out"}`)
            )
            .join(", ");
        }

        // Only destructure real outputs
        let outputVars: string[] = [];
        if (node.data.outputs && Array.isArray(node.data.outputs)) {
          outputVars = node.data.outputs
            .map((output: { name: string }) => {
              if (!output || !output.name) return undefined;
              return sanitizeVarName(`${processName}_${output.name}`);
            })
            .filter(Boolean);
        }

        if (outputVars.length > 0) {
          processInvocations.push(
            `    (${outputVars.join(
              ", "
            )}) = ${processName}(${inputChannels})\n`
          );
        } else {
          processInvocations.push(`    ${processName}(${inputChannels})\n`);
        }
      } else if (node.type === "outputDisplay") {
        // Generate output process that saves files to results directory
        const outputLabel = (node.data.label || "Output").replace(
          /[\s-]+/g,
          "_"
        );
        const downloadFormat = node.data.downloadFormat || "txt";
        const selectedFileName = node.data.selectedFileName || "all";
        const containerImage = node.data.containerImage || "ubuntu:22.04";
        const cpus = node.data.cpus || 1;
        const memory = node.data.memory || "2.GB";

        // Use template for output display
        processScripts[node.id] = generateOutputCode({
          processName,
          cpuCount: cpus,
          memoryAmount: memory,
          containerImage,
          outputLabel,
          downloadFormat,
          selectedFileName,
          outputDisplayCounter,
          outputNamingPattern,
          workflowName,
          timestamp,
          date: dateStr,
        });

        executionOrder.push(node.id);

        // Add process call in workflow instead of view statement (to be executed after channel definitions)
        processInvocations.push(
          `    // Save output from: ${node.data.label || "Output"}\n`
        );
        processInvocations.push(
          `    ${processName}(${
            selectedFileName === "all"
              ? upstreamChannelName + ".collect()"
              : upstreamChannelName
          })\n`
        );

        // Increment counter for next output display node
        outputDisplayCounter++;
      }
    }
  });

  // Final Script Assembly
  let finalScript = `// Workflow Script for ${workflowName}\n\n`;
  finalScript += paramsScript;
  finalScript += firstPassScript;

  // Deduplicate executionOrder to prevent duplicate process definitions
  const uniqueExecutionOrder = [...new Set(executionOrder)];

  // Create a map to ensure each process script is only included once
  const uniqueProcessScripts = new Map<string, string>();
  uniqueExecutionOrder.forEach((id) => {
    if (processScripts[id] && !uniqueProcessScripts.has(id)) {
      uniqueProcessScripts.set(id, processScripts[id]);
    }
  });

  const orderedProcessScripts = executionOrder
    .filter((id, idx) => executionOrder.indexOf(id) === idx)
    .map((id) => processScripts[id])
    .filter(Boolean);
  if (orderedProcessScripts.length > 0) {
    finalScript += "\n" + orderedProcessScripts.join("\n\n") + "\n";
  }

  finalScript += "\nworkflow {\n";
  finalScript += channelDefinitions.join(""); // Channel definitions first

  // FIXED: Sort process invocations to ensure variables are defined before they're used
  const sortedInvocations: string[] = [];
  const outputInvocations: string[] = [];

  // Build a map of which variables are defined by which invocations
  const variableDefinitions = new Map<string, string>();
  const variableUsages = new Map<string, string[]>();

  processInvocations.forEach((invocation) => {
    // Skip comments and empty lines
    if (invocation.trim().startsWith("//") || invocation.trim() === "") {
      return;
    }

    // Parse variable definition (left side of =) - improved regex
    const definitionMatch = invocation.match(/^\s*(\w+(?:_\w+)*)\s*=/);
    if (definitionMatch) {
      const varName = definitionMatch[1];
      variableDefinitions.set(varName, invocation);
    }

    // Parse variable usage (right side of =, inside parentheses) - improved regex
    const functionCallMatch = invocation.match(/=\s*\w+\(([^)]+)\)/);
    if (functionCallMatch) {
      const argumentsStr = functionCallMatch[1];
      // Find variable names in the arguments
      const variableMatches = argumentsStr.match(/\b(\w+(?:_\w+)*)\b/g);
      if (variableMatches) {
        variableMatches.forEach((usedVar) => {
          // Only track variables that look like channel names (contain underscores or match our patterns)
          if (
            usedVar.includes("_") ||
            usedVar.startsWith("ch_") ||
            usedVar.startsWith("node_")
          ) {
            if (!variableUsages.has(usedVar)) {
              variableUsages.set(usedVar, []);
            }
            variableUsages.get(usedVar)!.push(invocation);
          }
        });
      }
    }
  });

  // Add invocations in dependency order - variables must be defined before used
  const processed = new Set<string>();
  const processing = new Set<string>(); // Track currently processing to detect cycles

  function addInvocation(invocation: string): void {
    if (processed.has(invocation)) return;

    // Prevent infinite recursion by detecting cycles
    if (processing.has(invocation)) {
      console.warn(
        `Circular dependency detected for invocation: ${invocation}`
      );
      return;
    }

    processing.add(invocation);

    // Parse what variables this invocation uses
    const functionCallMatch = invocation.match(/=\s*\w+\(([^)]+)\)/);
    if (functionCallMatch) {
      const argumentsStr = functionCallMatch[1];
      const variableMatches = argumentsStr.match(/\b(\w+(?:_\w+)*)\b/g);

      if (variableMatches) {
        variableMatches.forEach((usedVar) => {
          // Only check dependencies for variables that look like channel names
          if (
            usedVar.includes("_") ||
            usedVar.startsWith("ch_") ||
            usedVar.startsWith("node_")
          ) {
            const definingInvocation = variableDefinitions.get(usedVar);
            // If this invocation uses a variable, make sure that variable is defined first
            if (definingInvocation && !processed.has(definingInvocation)) {
              addInvocation(definingInvocation);
            }
          }
        });
      }
    }

    processing.delete(invocation);

    // Now add this invocation
    if (invocation.includes("save_")) {
      if (!outputInvocations.includes(invocation)) {
        outputInvocations.push(invocation);
      }
    } else {
      if (!sortedInvocations.includes(invocation)) {
        sortedInvocations.push(invocation);
      }
    }
    processed.add(invocation);
  }

  // Process all invocations
  processInvocations.forEach((invocation) => {
    if (!invocation.trim().startsWith("//") && invocation.trim() !== "") {
      addInvocation(invocation);
    }
  });

  // Add comment lines as-is
  processInvocations.forEach((invocation) => {
    if (invocation.trim().startsWith("//") || invocation.trim() === "") {
      if (
        !sortedInvocations.includes(invocation) &&
        !outputInvocations.includes(invocation)
      ) {
        if (
          invocation.includes("save_") ||
          invocation.includes("Save output")
        ) {
          outputInvocations.push(invocation);
        } else {
          sortedInvocations.push(invocation);
        }
      }
    }
  });

  finalScript += sortedInvocations.join(""); // Process calls in dependency order
  finalScript += outputInvocations.join(""); // Output processes last
  finalScript += "\n}\n";

  return finalScript;
};

function sanitizeVarName(name: string): string {
  if (typeof name !== "string") return "";
  let sanitized = name.replace(/[-\s]+/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = "v_" + sanitized;
  }
  return sanitized;
}
