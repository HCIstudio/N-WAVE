import type { Node, Edge } from "reactflow";
import type { FileObject } from "../../components/nodes/BaseNode";
import { sortIncomingEdges } from "../../utils/workflowConnections";
import { getNodeDefinitionForNode } from "../../registry/nodeDefinitions";
import { helperFunctionsFor } from "./helpers";
import {
  generateParameterDeclarations,
  getNodeParameters,
  type WorkflowParameter,
} from "../../registry/params";
import {
  generateSamplesheetChannel,
  getSamplesheetFileName,
  getSamplesheetMapping,
} from "../../registry/samplesheet";

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
/**
 * True when an invocation holds only comments or blank lines. Code that
 * starts with a comment (channel operator code, say) still counts as code.
 */
const isCommentOnly = (invocation: string): boolean =>
  invocation
    .split("\n")
    .every((line) => line.trim() === "" || line.trim().startsWith("//"));

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
  const includeStatements: string[] = [];
  const nextflowConfigBlocks: string[] = [];
  // Top-level input channels defined by file-input nodes (e.g. "ch_files").
  // These are legitimate workflow inputs, not process outputs, so they must be
  // recognised as "resolved" during dependency validation.
  const definedInputChannels = new Set<string>();
  // Declared dependencies of invocations (see NodeGenerationResult).
  const declaredDependencies = new Map<
    string,
    { definitions: string[]; usages: string[] }
  >();
  const dependenciesOf = (invocation: string) =>
    declaredDependencies.get(invocation) ?? parseInvocation(invocation);

  // Input nodes read from the input directory; declare it once.
  let inputDirDeclared = false;
  const declareInputDir = () => {
    if (inputDirDeclared) return;
    inputDirDeclared = true;
    paramsScript += `params.inputdir = "./inputs"\n`;
  };

  // First pass: Define file inputs and map all node outputs to channel names
  // `name = value` lines for the exported config's params { } block.
  const paramConfigLines: string[] = [];

  for (const node of nodes) {
    if (node.type === "parameters") {
      const parameters = getNodeParameters(node.data);
      const channelNameFor = (parameter: WorkflowParameter) =>
        sanitizeVarName(`${node.id}_${parameter.name}`);
      const declarations = generateParameterDeclarations(
        parameters,
        channelNameFor
      );
      for (const parameter of parameters.filter((entry) => entry.type === "file")) {
        const channelName = channelNameFor(parameter);
        channelNameMap.set(`${node.id}.${parameter.name}`, channelName);
        definedInputChannels.add(channelName);
      }
      if (declarations.channels) declareInputDir();
      paramsScript += declarations.script;
      paramConfigLines.push(...declarations.config);
      if (declarations.channels) firstPassScript += `${declarations.channels}\n`;
    } else if (node.type === "samplesheet") {
      const channelName = sanitizeVarName(`${node.id}_samples`);
      channelNameMap.set(`${node.id}.samples`, channelName);
      channelNameMap.set(`${node.id}.out`, channelName);
      definedInputChannels.add(channelName);

      declareInputDir();
      const { params, channel } = generateSamplesheetChannel({
        channelName,
        paramName: sanitizeVarName(`samplesheet_${node.id}`),
        fileName: getSamplesheetFileName(node.data),
        mapping: getSamplesheetMapping(node.data),
      });
      paramsScript += params;
      firstPassScript += `${channel}\n`;
    } else if (node.type === "fileInput") {
      const channelName = "ch_files";
      const legacyFileOutputChannelName = sanitizeVarName(
        `${node.id}_ch_files_out`
      );
      channelNameMap.set(`${node.id}.ch_files_out`, channelName);
      channelNameMap.set(`${node.id}.out`, channelName);
      definedInputChannels.add(channelName);

      // Extract selected filenames from the node data
      const selectedFiles = node.data.files || [];
      const filenames = selectedFiles.map(
        (file: FileObject) => file.name || file.originalName || "unknown_file"
      );

      if (filenames.length > 0) {
        // Add parameters for input directory and selected files
        declareInputDir();
        paramsScript += `params.selected_files = [${filenames
          .map((name: string) => `'${name}'`)
          .join(", ")}]\n\n`;

        // Create channel from file list with proper file staging
        firstPassScript += `${channelName} = Channel.fromList(params.selected_files)\n`;
        firstPassScript += `    .map { filename -> file("\${params.inputdir}/\${filename}") }\n\n`;
        firstPassScript += `${legacyFileOutputChannelName} = ${channelName}\n\n`;
      } else {
        // Fallback if no files
        declareInputDir();
        paramsScript += "params.selected_files = []\n\n";
        firstPassScript += `${channelName} = Channel.empty()\n\n`;
        firstPassScript += `${legacyFileOutputChannelName} = ${channelName}\n\n`;
      }
    } else {
      for (const output of node.data.outputs ?? []) {
        // Use the actual output name for better mapping, especially for processes like FastQC
        const channelName = `${node.id.replace(/[\s-]+/g, "_")}_${output.name}`;
        channelNameMap.set(`${node.id}.${output.name}`, channelName);
      }

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
  }

  // Track which process nodes have already been invoked
  const invokedNodes = new Set<string>();

  // Second pass: Build operator chains and process blocks
  const processedNodes = new Set<string>();
  for (const node of nodes) {
    if (processedNodes.has(node.id)) continue;
    processedNodes.add(node.id);

    if (
      node.type === "operator" ||
      node.type === "filter" ||
      node.type === "process" ||
      node.type === "channelOperator" ||
      node.type === "outputDisplay"
    ) {
      if (invokedNodes.has(node.id)) continue;
      invokedNodes.add(node.id);
      const processName = getProcessNameForNode(node);
      const incomingEdges = sortIncomingEdges(
        edges.filter((edge) => edge.target === node.id)
      );
      if (incomingEdges.length === 0) continue;

      const upstreamChannelName = resolveChannelNameForEdge(
        incomingEdges[0],
        channelNameMap
      );
      if (!upstreamChannelName) continue;

      // Output display nodes don't have outputs, so skip this check for them
      let outputChannelName = null;
      if (node.type !== "outputDisplay") {
        // For processes with multiple outputs (like FastQC), we'll handle them specially
        // Skip the early return check for FastQC since it handles outputs differently
        if (node.data.processType !== "fastqc") {
          outputChannelName = channelNameMap.get(
            `${node.id}.${node.data.outputs[0].name}`
          );
          if (!outputChannelName) continue;
        }
      }

      const nodeDefinition = getNodeDefinitionForNode(node);
      const generationResult = nodeDefinition?.generateNextflow?.({
        node,
        processName,
        incomingEdges,
        upstreamChannelName,
        outputChannelName,
        channelNameMap,
        outputDisplayCounter,
        outputNamingPattern,
        workflowName,
        timestamp,
        date: dateStr,
        resolveChannelNameForEdge,
        buildMixedChannelExpression,
        sanitizeVarName,
      });

      if (!generationResult) continue;

      processScripts[node.id] = generationResult.processScript;

      if (generationResult.includeInExecutionOrder !== false) {
        executionOrder.push(node.id);
      }

      if (generationResult.channelDefinitions) {
        channelDefinitions.push(...generationResult.channelDefinitions);
      }

      if (generationResult.includeStatements) {
        includeStatements.push(...generationResult.includeStatements);
      }

      if (generationResult.nextflowConfigBlocks) {
        nextflowConfigBlocks.push(...generationResult.nextflowConfigBlocks);
      }

      processInvocations.push(...generationResult.processInvocations);
      if (generationResult.dependencies) {
        for (const invocation of generationResult.processInvocations) {
          declaredDependencies.set(invocation, {
            definitions: generationResult.dependencies.defines,
            usages: generationResult.dependencies.uses,
          });
        }
      }
      outputDisplayCounter +=
        generationResult.outputDisplayCounterIncrement ?? 0;
    }
  }

  // Final Script Assembly
  let finalScript = `// Workflow Script for ${workflowName}\n`;
  finalScript += "// N-WAVE generator: registry-nfcore-v1\n\n";
  finalScript += "nextflow.enable.dsl = 2\n\n";
  finalScript += paramsScript;
  if (nextflowConfigBlocks.length > 0 || paramConfigLines.length > 0) {
    finalScript += "/* N-WAVE_NEXTFLOW_CONFIG\n";
    if (paramConfigLines.length > 0) {
      finalScript += `params {\n${paramConfigLines.map((line) => `  ${line}`).join("\n")}\n}\n`;
    }
    if (nextflowConfigBlocks.length > 0) {
      finalScript += "process {\n";
      finalScript += Array.from(new Set(nextflowConfigBlocks))
        .map((block) =>
          block
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")
        )
        .join("\n\n");
      finalScript += "\n}";
    }
    finalScript += "\n*/\n\n";
  }
  const uniqueIncludeStatements = Array.from(new Set(includeStatements));
  if (uniqueIncludeStatements.length > 0) {
    finalScript += uniqueIncludeStatements.join("\n");
    finalScript += "\n\n";
  }
  // Helper functions the generated code calls (top-level, strict syntax).
  const helperFunctions = helperFunctionsFor(
    [firstPassScript, ...channelDefinitions, ...processInvocations].join("\n")
  );
  if (helperFunctions.length > 0) {
    finalScript += `${helperFunctions.join("\n\n")}\n\n`;
  }

  // Deduplicate executionOrder to prevent duplicate process definitions
  const uniqueExecutionOrder = [...new Set(executionOrder)];

  // Create a map to ensure each process script is only included once
  const uniqueProcessScripts = new Map<string, string>();
  for (const id of uniqueExecutionOrder) {
    if (processScripts[id] && !uniqueProcessScripts.has(id)) {
      uniqueProcessScripts.set(id, processScripts[id]);
    }
  }

  const orderedProcessScripts = executionOrder
    .filter((id, idx) => executionOrder.indexOf(id) === idx)
    .map((id) => processScripts[id])
    .filter(Boolean);
  if (orderedProcessScripts.length > 0) {
    finalScript += `\n${orderedProcessScripts.join("\n\n")}\n`;
  }

  finalScript += "\nworkflow {\n";
  // Input channels (File Input, Samplesheet, Parameters) are statements, so
  // they belong in the workflow block.
  if (firstPassScript.trim()) {
    finalScript += `${firstPassScript
      .trimEnd()
      .split("\n")
      .map((line) => (line ? `    ${line}` : line))
      .join("\n")}\n\n`;
  }
  // Channel definitions are ordered with the process calls below: one built
  // from another node's output must come after the call that defines it.

  // FIXED: Sort process invocations to ensure variables are defined before they're used
  const sortedInvocations: string[] = [];
  const outputInvocations: string[] = [];

  // Build a map of which variables are defined by which invocations
  const variableDefinitions = new Map<string, string>();
  const variableUsages = new Map<string, string[]>();

  for (const definition of channelDefinitions) {
    const { definitions } = dependenciesOf(definition);

    for (const varName of definitions) {
      variableDefinitions.set(varName, definition);
    }
  }

  for (const invocation of processInvocations) {
    // Skip comments and empty lines
    if (isCommentOnly(invocation)) {
      continue;
    }

    const { definitions, usages } = dependenciesOf(invocation);

    for (const varName of definitions) {
      variableDefinitions.set(varName, invocation);
    }

    for (const usedVar of usages) {
      if (!variableUsages.has(usedVar)) {
        variableUsages.set(usedVar, []);
      }
      variableUsages.get(usedVar)?.push(invocation);
    }
  }

  // Add invocations in dependency order - variables must be defined before used
  const processed = new Set<string>();
  const processing = new Set<string>(); // Track currently processing to detect cycles
  const channelDefinitionSet = new Set(channelDefinitions);

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

    for (const usedVar of dependenciesOf(invocation).usages) {
      const definingInvocation = variableDefinitions.get(usedVar);
      // If this invocation uses a variable, make sure that variable is defined first
      if (definingInvocation && !processed.has(definingInvocation)) {
        addInvocation(definingInvocation);
      }
    }

    processing.delete(invocation);

    if (channelDefinitionSet.has(invocation)) {
      if (!sortedInvocations.includes(invocation)) {
        sortedInvocations.push(invocation);
      }
      processed.add(invocation);
      return;
    }

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

  // Process all invocations, then any channel definition nothing uses
  for (const invocation of [...processInvocations, ...channelDefinitions]) {
    if (!isCommentOnly(invocation)) {
      addInvocation(invocation);
    }
  }

  // Fail fast when an invocation uses an unresolved variable
  for (const [usedVar, dependentInvocations] of variableUsages) {
    if (!variableDefinitions.has(usedVar)) {
      // Input channels from file-input nodes are defined at the top of the
      // workflow rather than produced by a process invocation — they're
      // resolved, not missing.
      if (definedInputChannels.has(usedVar)) {
        continue;
      }

      if (usedVar.startsWith("ch_") || usedVar.startsWith("node_")) {
        console.warn(
          `Treating unresolved variable "${usedVar}" as workflow input. Used in: ${dependentInvocations.join(
            " | "
          )}`
        );
        continue;
      }

      throw new Error(
        `Unable to resolve dependency "${usedVar}" in generated workflow. ` +
          `Used in invocation(s): ${dependentInvocations.join(" | ")}`
      );
    }
  }

  // Add comment lines as-is
  for (const invocation of processInvocations) {
    if (isCommentOnly(invocation)) {
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
  }

  finalScript += sortedInvocations.join(""); // Process calls in dependency order
  finalScript += outputInvocations.join(""); // Output processes last
  finalScript += "\n}\n";

  return finalScript;
};

function parseInvocation(invocation: string): {
  definitions: string[];
  usages: string[];
} {
  const definitions: string[] = [];
  const usages: string[] = [];

  const trimmed = invocation.trim();
  if (isCommentOnly(trimmed)) {
    return { definitions, usages };
  }

  for (const line of trimmed.split(/\r?\n/)) {
    const lineTrimmed = line.trim();
    if (!lineTrimmed || lineTrimmed.startsWith("//")) continue;

    // Tuple assignment: `(a, b) = process(...)`
    const tupleDefinitionMatch = lineTrimmed.match(
      /^\(\s*([^)]+?)\s*\)\s*=\s*\w+\(/
    );
    if (tupleDefinitionMatch) {
      const tupleNames = tupleDefinitionMatch[1]
        .split(",")
        .map((name) => sanitizeVarName(name.trim()))
        .filter(
          (name) =>
            name.includes("_") ||
            name.startsWith("ch_") ||
            name.startsWith("node_")
        );
      for (const name of tupleNames) {
        if (!definitions.includes(name)) definitions.push(name);
      }
      continue;
    }

    // Single assignment: `var = process(...)`
    const definitionMatch = lineTrimmed.match(
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/
    );
    if (definitionMatch) {
      const varName = sanitizeVarName(definitionMatch[1]);
      if (
        varName &&
        (varName.includes("_") ||
          varName.startsWith("ch_") ||
          varName.startsWith("node_")) &&
        !definitions.includes(varName)
      ) {
        definitions.push(varName);
      }
    }
  }

  for (const arg of getInvocationArguments(invocation)) {
    if (!usages.includes(arg)) usages.push(arg);
  }
  for (const arg of getChainedChannelRoots(invocation)) {
    if (!usages.includes(arg)) usages.push(arg);
  }

  return { definitions, usages };
}

function resolveChannelNameForEdge(
  edge: Edge,
  channelNameMap: Map<string, string>
): string | null {
  const upstreamChannelName = channelNameMap.get(
    `${edge.source}.${edge.sourceHandle}`
  );

  if (upstreamChannelName) {
    return upstreamChannelName;
  }

  let alternativeChannelName = null;

  if (edge.sourceHandle?.includes("_")) {
    const outputName = edge.sourceHandle.split("_").pop();
    alternativeChannelName = channelNameMap.get(`${edge.source}.${outputName}`);
  }

  if (!alternativeChannelName && edge.sourceHandle) {
    alternativeChannelName = channelNameMap.get(
      `${edge.source}.${edge.sourceHandle}`
    );
  }

  if (!alternativeChannelName) {
    for (const [key, value] of channelNameMap.entries()) {
      if (key.startsWith(`${edge.source}.`)) {
        alternativeChannelName = value;
        console.warn(`Using fallback channel mapping: ${key} -> ${value}`);
        break;
      }
    }
  }

  if (alternativeChannelName) {
    console.warn(
      `Using alternative channel mapping for ${edge.source}.${edge.sourceHandle} -> ${alternativeChannelName}`
    );
    return alternativeChannelName;
  }

  console.warn(`No upstream channel found for ${edge.source}.${edge.sourceHandle}`);
  console.warn("Available channel mappings:", Array.from(channelNameMap.entries()));
  return null;
}

/** Process name the generator uses for a node, e.g. "filter_node_123". */
export function getProcessNameForNode(node: Node): string {
  let type = node.data.processType || node.data.operatorType || node.type;
  if (!type || typeof type !== "string" || type === "undefined") {
    type = "process";
  }
  return `${type}_${node.id.replace(/[\s-]+/g, "_")}`;
}

export function buildMixedChannelExpression(channelNames: string[]): string {
  if (channelNames.length === 1) {
    return channelNames[0];
  }

  return channelNames
    .slice(1)
    .reduce((expression, channelName) => `${expression}.concat(${channelName})`, channelNames[0]);
}

function getInvocationArguments(invocation: string): string[] {
  const trimmed = invocation.trim();
  if (trimmed === "" || trimmed.startsWith("//")) {
    return [];
  }

  // String literals ('gene_id', "${params.x}") hold no channel names.
  const rhs = getInvocationExpression(trimmed).replace(
    /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g,
    "''",
  );
  const candidatePattern = /\b[A-Za-z_][A-Za-z0-9_]*(?:_[A-Za-z0-9_]+)*\b/g;
  const lhsDefinitions = new Set<string>();
  const tupleDefinitionMatch = trimmed.match(/^\(\s*([^)]+?)\s*\)\s*=\s*\w+\(/);
  if (tupleDefinitionMatch) {
    for (const name of tupleDefinitionMatch[1].split(",")) {
      const sanitized = sanitizeVarName(name.trim());
      if (sanitized) lhsDefinitions.add(sanitized);
    }
  } else {
    const definitionMatch = trimmed.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (definitionMatch) {
      lhsDefinitions.add(sanitizeVarName(definitionMatch[1]));
    }
  }
  const args: string[] = [];

  for (
    let match = candidatePattern.exec(rhs);
    match !== null;
    match = candidatePattern.exec(rhs)
  ) {
    const rawName = match[0];
    const name = sanitizeVarName(rawName);
    if (!name || lhsDefinitions.has(name)) {
      continue;
    }

    const startIndex = match.index;
    const endIndex = startIndex + rawName.length;
    const previousChar = startIndex > 0 ? rhs.charAt(startIndex - 1) : "";
    const nextNonWhitespaceChar =
      rhs.slice(endIndex).match(/^\s*(.)/)?.[1] ?? "";

    // Exclude method names like `.collect` or `.mix`.
    if (previousChar === ".") {
      continue;
    }

    // Exclude assignment targets inside multi-line invocation blocks.
    if (nextNonWhitespaceChar === "=") {
      continue;
    }

    // Exclude process aliases in module output references like `FASTQC_1.out.html`.
    if (rhs.slice(endIndex).match(/^\s*\.out\./)) {
      continue;
    }

    // Exclude the callee in direct function/process invocations like `foo(bar)`.
    if (nextNonWhitespaceChar === "(") {
      continue;
    }

    if (
      (name.includes("_") || name.startsWith("ch_") || name.startsWith("node_")) &&
      !args.includes(name)
    ) {
      args.push(name);
    }
  }

  return args;
}

function getChainedChannelRoots(invocation: string): string[] {
  const trimmed = invocation.trim();
  if (trimmed === "" || trimmed.startsWith("//")) {
    return [];
  }

  const rhs = getInvocationExpression(trimmed);
  const chainRootPattern =
    /\b([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*(?:map|filter|collect|concat|mix|flatten|view|set|first|combine|join|groupTuple|unique|toList)\b/g;
  const roots: string[] = [];
  let match = chainRootPattern.exec(rhs);
  while (match !== null) {
    const name = sanitizeVarName(match[1] ?? "");
    if (
      name &&
      (name.includes("_") || name.startsWith("ch_") || name.startsWith("node_")) &&
      !roots.includes(name)
    ) {
      roots.push(name);
    }
    match = chainRootPattern.exec(rhs);
  }

  return roots;
}

function getInvocationExpression(trimmedInvocation: string): string {
  const tupleAssignmentMatch = trimmedInvocation.match(
    /^\s*\([^)]+?\)\s*=/
  );
  if (tupleAssignmentMatch) {
    return trimmedInvocation.substring(tupleAssignmentMatch[0].length);
  }

  const leadingAssignmentMatch = trimmedInvocation.match(
    /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/
  );
  if (leadingAssignmentMatch) {
    return trimmedInvocation.substring(leadingAssignmentMatch[0].length);
  }

  return trimmedInvocation;
}

export function sanitizeVarName(name: string): string {
  if (typeof name !== "string") return "";
  let sanitized = name.replace(/[-\s]+/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `v_${sanitized}`;
  }
  return sanitized;
}
