import type { Node, Edge } from "@xyflow/react";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { sortIncomingEdges } from "../../utils/workflowConnections";
import { getNodeDefinitionForNode } from "../../registry/nodeDefinitions";
import { helperFunctionsFor } from "./helpers";
import { CODE_PLACEMENTS, type CodePlacement, placementOf } from "./placement";
import { closingBracket, maskSource, topLevelItems } from "../../workflows/import/nextflowSource";
import {
  generateParameterDeclarations,
  getNodeParameters,
  singleQuoted,
  type WorkflowParameter,
} from "../../registry/params";
import {
  generateSamplesheetChannel,
  getSamplesheetFileName,
  getSamplesheetMapping,
} from "../../registry/samplesheet";
import { edgesIntoPort } from "../../registry/portArity";
import { buildMixedChannelExpression } from "./mixChannels";
import { describeCycle, findCycle } from "../../registry/workflowCycles";
import { lowerSnake, processNamesFor, uniqueName } from "./naming";
import { formatLayoutComment } from "./layoutComment";
import type { ItemShape } from "../../registry/nodeGeneration";

// Writes a workflow on the canvas as a Nextflow script, the way a person
// would write it: each step a process (or an nf-core module) named after its
// label, called in the order the steps depend on each other, its outputs
// read as `STEP.out.<name>`. Input nodes become channels at the top of the
// workflow. The last line records where each node sits on the canvas, so
// importing the script gives the same canvas back (see layoutComment.ts).
//
// Each node type writes its own code (its definition's generateNextflow);
// this file names things, orders the steps and tidies the result.

/** The first line of every script N-WAVE writes (the backend looks for it). */
export const GENERATED_HEADER = "// Written by N-WAVE: https://github.com/HCIstudio/N-WAVE";

/** Node types that are steps in the workflow (called, in dependency order). */
const STEP_TYPES = new Set(["operator", "filter", "process", "channelOperator", "outputDisplay"]);

/** Nodes whose output is plain files (never `[meta, files]` tuples). */
const FILE_OUTPUT_TYPES = new Set(["fileInput", "operator", "filter"]);

export interface GenerateOptions {
  /** Write the layout comment (default true). */
  layout?: boolean;
}

/**
 * Generates a Nextflow script from the current workflow nodes.
 *
 * @param nodes An array of nodes from the React Flow instance.
 * @param edges An array of edges from the React Flow instance.
 * @param workflowName The name of the workflow.
 * @param outputDirectory The output directory for the workflow.
 * @param outputNamingPattern The output naming pattern for the workflow.
 * @returns A string containing the generated Nextflow script.
 */
export const generateNextflowScript = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflowName: string,
  outputDirectory: string,
  outputNamingPattern = "{workflow_name}",
  options: GenerateOptions = {},
): string => generateNextflowScriptWithNames(nodes, edges, workflowName, outputDirectory, outputNamingPattern, options).script;

/**
 * The script, with the name each node has in it (`names`): its process or
 * call name, or the channel it defines. The analysis maps what it finds in
 * the script back to nodes with these.
 */
export const generateNextflowScriptWithNames = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  workflowName: string,
  outputDirectory: string,
  outputNamingPattern = "{workflow_name}",
  options: GenerateOptions = {},
): { script: string; names: Map<string, string> } => {
  // A loop has no order to write its channels in (the workflow check and the
  // canvas say so first; downloads and exports show this message).
  const cycle = findCycle(edges);
  if (cycle) {
    throw new Error(
      `The workflow has a loop (${describeCycle(cycle, nodes)}), so its Nextflow script can't be written. Remove one of these connections.`
    );
  }

  // Only a naming pattern that asks for them puts the time or date in names.
  const timestamp = outputNamingPattern.includes("{timestamp}") ? Date.now() : 0;
  const dateStr = outputNamingPattern.includes("{date}")
    ? new Date().toISOString().split("T")[0]
    : "";

  const processNames = processNamesFor(nodes);
  const order = stepOrder(nodes, edges, processNames);
  // Lower-case names for channels: unique, apart from the processes' upper-case ones.
  const takenChannels = new Set<string>();

  // Convert outputDirectory to use forward slashes for Nextflow compatibility
  const nfOutputDirectory = outputDirectory.replace(/\\/g, "/");

  let paramsScript = `params.outdir = ${singleQuoted(nfOutputDirectory)}\n`;
  let inputScript = "";
  const channelNameMap = new Map<string, string>();

  // Input nodes read from the input directory; declare it once.
  let inputDirDeclared = false;
  const declareInputDir = () => {
    if (inputDirDeclared) return;
    inputDirDeclared = true;
    paramsScript += `params.inputdir = 'inputs'\n`;
  };

  // `name = value` lines for the exported config's params { } block.
  const paramConfigLines: string[] = [];

  // Parameters keep their names (`params.fasta`, `ch_fasta`): other inputs
  // are named around them.
  for (const node of nodes) {
    if (node.type !== "parameters") continue;
    for (const parameter of getNodeParameters(node.data)) {
      if (parameter.type === "file") takenChannels.add(`ch_${lowerSnake(parameter.name)}`);
    }
  }
  takenChannels.delete("ch_");
  /** The name each node has in the layout line: what the code calls it. */
  const layoutNames = new Map(processNames);

  // Input nodes: params at the top, channels at the start of the workflow.
  for (const node of order) {
    if (node.type === "parameters") {
      const parameters = getNodeParameters(node.data);
      const channelNameFor = (parameter: WorkflowParameter) => `ch_${lowerSnake(parameter.name) || "param"}`;
      layoutNames.set(node.id, uniqueName("params", takenChannels));
      const declarations = generateParameterDeclarations(parameters, channelNameFor);
      for (const parameter of parameters.filter((entry) => entry.type === "file")) {
        channelNameMap.set(`${node.id}.${parameter.name}`, channelNameFor(parameter));
      }
      if (declarations.channels) declareInputDir();
      paramsScript += declarations.script;
      paramConfigLines.push(...declarations.config);
      if (declarations.channels) inputScript += `${declarations.channels}\n`;
    } else if (node.type === "samplesheet") {
      const base = lowerSnake(String(node.data.label || "")) || "samplesheet";
      const channelName = uniqueName(`ch_${base}`, takenChannels);
      layoutNames.set(node.id, channelName);
      channelNameMap.set(`${node.id}.samples`, channelName);
      channelNameMap.set(`${node.id}.out`, channelName);

      declareInputDir();
      const { params, channel } = generateSamplesheetChannel({
        channelName,
        paramName: channelName.replace(/^ch_/, ""),
        fileName: getSamplesheetFileName(node.data),
        mapping: getSamplesheetMapping(node.data),
      });
      paramsScript += params;
      inputScript += `${channel}\n`;
    } else if (node.type === "fileInput") {
      // "File Input" (the default label) reads `params.files` into `ch_files`.
      const label = String(node.data.label || "");
      const base = !label || label === "File Input" ? "files" : lowerSnake(label) || "files";
      const channelName = uniqueName(`ch_${base}`, takenChannels);
      layoutNames.set(node.id, channelName);
      const param = `params.${channelName.replace(/^ch_/, "")}`;
      channelNameMap.set(`${node.id}.ch_files_out`, channelName);
      channelNameMap.set(`${node.id}.out`, channelName);

      const filenames = (node.data.files || []).map(
        (file: FileObject) => file.name || file.originalName || "unknown_file"
      );
      declareInputDir();
      paramsScript += `${param} = [${filenames.map(singleQuoted).join(", ")}]\n`;
      inputScript +=
        filenames.length > 0
          ? `${channelName} = channel.fromList(${param})\n    .map { name -> file("\${params.inputdir}/\${name}", checkIfExists: true) }\n\n`
          : `${channelName} = channel.empty()\n\n`;
    } else if (node.type === "channelOperator") {
      // Channels named after the node: `ch_<label>` (`ch_<label>_<output>` for
      // several), or as an imported script named them.
      const base = `ch_${lowerSnake(String(node.data.label || "")) || "channels"}`;
      const outputs = node.data.outputs ?? [];
      const kept = (node.data.channelNames ?? {}) as Record<string, string>;
      for (const [index, output] of outputs.entries()) {
        const wanted = kept[output.name];
        // The script's own name when it's free (uniqueName then keeps it as is).
        const keep = Boolean(wanted) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(wanted) && !takenChannels.has(wanted);
        const channelName = uniqueName(
          keep ? wanted : outputs.length === 1 ? base : `${base}_${lowerSnake(output.name) || "out"}`,
          takenChannels,
        );
        channelNameMap.set(`${node.id}.${output.name}`, channelName);
        if (index === 0) layoutNames.set(node.id, channelName);
      }
      // Code without outputs (`ch.view()`) is named after its label in the layout line.
      if (outputs.length === 0 && !placementOf(node.data)) layoutNames.set(node.id, uniqueName(lowerSnake(String(node.data.label || "")) || "channels", takenChannels));
    } else if (node.type === "operator" || node.type === "filter") {
      // Filter, Map and Merge have one output: STEP.out.
      const reference = `${processNames.get(node.id)}.out`;
      for (const output of node.data.outputs ?? []) channelNameMap.set(`${node.id}.${output.name}`, reference);
      channelNameMap.set(`${node.id}.out`, reference);
    } else {
      // A step's outputs: named here, read as STEP.out.<name> once it's called.
      for (const output of node.data.outputs ?? []) {
        const channelName = `${node.id.replace(/[\s-]+/g, "_")}_${output.name}`;
        channelNameMap.set(`${node.id}.${output.name}`, channelName);
      }
      const firstOutputName = node.data.outputs?.[0]?.name;
      if (firstOutputName) {
        const fallbackChannelName = `${node.id.replace(/[\s-]+/g, "_")}_${firstOutputName}`;
        channelNameMap.set(`${node.id}.out`, fallbackChannelName);
        channelNameMap.set(`${node.id}_out`, fallbackChannelName);
        channelNameMap.set(`${node.id}.output`, fallbackChannelName);
      }
    }
  }

  const processScripts: string[] = [];
  const noteComments: string[] = [];
  const includeStatements: string[] = [];
  const nextflowConfigBlocks: string[] = [];
  /** Each step's statements, in order; Display Output steps go last. */
  const stepStatements: string[] = [];
  const outputStatements: string[] = [];
  let outputDisplayCounter = 1;

  /** Steps whose call the script assigned to a variable (put back after naturalize). */
  const assignedCalls = new Map<string, string>();
    /** Code kept as written, by where it goes. */
  const placed = new Map<CodePlacement, string[]>();

  /**
   * A process or workflow imported from a script, written even when the
   * canvas can't call it (code calls it: `ch | FOO`, inside an `if`).
   */
  const keepImportedDefinition = (node: Node<NodeData>, processName: string) => {
    const stored = node.data.customNodeDefinition as { id?: string; source?: string; processName?: string; kind?: string } | undefined;
    if (!stored?.source || !String(stored.id ?? "").startsWith("local-")) return;
    const keyword = stored.kind === "workflow" ? "workflow" : "process";
    processScripts.push(
      stored.processName && stored.processName !== processName
        ? stored.source.replace(new RegExp(`\\b${keyword}\\s+${stored.processName}\\b`), `${keyword} ${processName}`)
        : stored.source,
    );
  };

  for (const node of order) {
    if (!STEP_TYPES.has(String(node.type))) continue;
    const placement = node.type === "channelOperator" ? placementOf(node.data) : null;
    if (placement) {
      layoutNames.set(node.id, uniqueName(CODE_PLACEMENTS[placement].key, takenChannels));
      const code = String(node.data.channelOperatorCode ?? "").replace(/\s+$/, "");
      if (code.trim()) placed.set(placement, [...(placed.get(placement) ?? []), code]);
      continue;
    }
    const processName = processNames.get(node.id) ?? "STEP";
    const incomingEdges = sortIncomingEdges(edges.filter((edge) => edge.target === node.id));
    // Steps that read no channel (`channel.fromPath(…)`, `sayHello()`) run on their own.
    const standalone =
      (node.data.inputs ?? []).length === 0 &&
      (node.type === "channelOperator" || (getNodeDefinitionForNode(node)?.inputs ?? []).length === 0);
    if (incomingEdges.length === 0 && (!standalone || node.data.definitionOnly === true)) {
      keepImportedDefinition(node, processName);
      continue;
    }

    // Every connection into the (first) input, mixed: a one-connection
    // input has a single one, unless the workflow check flags it.
    const firstInput =
      getNodeDefinitionForNode(node)?.inputs?.[0]?.name ?? node.data.inputs?.[0]?.name;
    const firstInputEdges = firstInput ? edgesIntoPort(node, incomingEdges, firstInput) : [];
    const upstreamEdges = firstInputEdges.length > 0 ? firstInputEdges : incomingEdges.slice(0, 1);
    const upstreamNames = upstreamEdges
      .map((edge) => resolveChannelNameForEdge(edge, channelNameMap))
      .filter((name): name is string => Boolean(name));
    if (upstreamNames.length === 0 && !standalone) {
      keepImportedDefinition(node, processName);
      continue;
    }
    const upstreamChannelName = buildMixedChannelExpression(upstreamNames);
    const upstreamIsFiles = incomingEdges.every((edge) =>
      FILE_OUTPUT_TYPES.has(String(nodes.find((candidate) => candidate.id === edge.source)?.type)),
    );

    // Output display nodes don't have outputs, so skip this check for them
    let outputChannelName = null;
    // Display Output, channel code like `.view()` and some processes have no outputs.
    if (node.type !== "outputDisplay" && (node.data.outputs ?? []).length > 0) {
      outputChannelName = channelNameMap.get(`${node.id}.${node.data.outputs?.[0]?.name}`);
      if (!outputChannelName) {
      keepImportedDefinition(node, processName);
      continue;
    }
    }

    const nodeDefinition = getNodeDefinitionForNode(node);
    const generationResult = nodeDefinition?.generateNextflow?.({
      node,
      processName,
      incomingEdges,
      upstreamChannelName,
      upstreamIsFiles,
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
      channelNameFor: (base: string) => uniqueName(lowerSnake(base) || "ch", takenChannels),
      shapeOf: (edge: Edge) => itemShape(edge, nodes),
    });

    if (!generationResult) {
      keepImportedDefinition(node, processName);
      continue;
    }

    if (generationResult.processScript.trim()) processScripts.push(generationResult.processScript);
    includeStatements.push(...(generationResult.includeStatements ?? []));
    nextflowConfigBlocks.push(...(generationResult.nextflowConfigBlocks ?? []));

    const statements = [
      ...(generationResult.channelDefinitions ?? []),
      ...generationResult.processInvocations,
    ]
      .filter((statement) => statement.trim() !== "")
      .map((statement) => statement.replace(/\n*$/, "\n"));
    // A channel operator's code is one block, after a blank line, under its
    // label when that says more than its channel's name; so it reads (and
    // imports) as one step.
    if (node.type === "channelOperator" && statements.length > 0) {
      const label = String(node.data.label || "").replace(/\n/g, " ").trim();
      const firstOutput = channelNameMap.get(`${node.id}.${node.data.outputs?.[0]?.name}`);
      // Not when it only repeats the node's name (`ch_channels_1`).
      if (label && label !== firstOutput && label !== layoutNames.get(node.id)) statements.unshift(`    // ${label}\n`);
      statements.unshift("\n");
    }
    // `samples_ch = RNASEQ(…)`: the variable the script gave the call's result.
    const assigned = String(node.data.scriptAssigned ?? "");
    if (node.type !== "channelOperator" && /^[A-Za-z_]\w*$/.test(assigned)) assignedCalls.set(processName, assigned);
    // Comments written above a step's call.
    const comments = Array.isArray(node.data.scriptComments) ? (node.data.scriptComments as unknown[]).map(String) : [];
    if (node.type !== "channelOperator" && comments.length > 0 && statements.length > 0) {
      statements.splice(statements.length - 1, 0, `\n${indent(comments.join("\n"))}\n`);
    }
    (node.type === "outputDisplay" ? outputStatements : stepStatements).push(statements.join(""));
    outputDisplayCounter += generationResult.outputDisplayCounterIncrement ?? 0;
  }

  // Final Script Assembly
  let finalScript = `// ${workflowName.replace(/\n/g, " ")}\n${GENERATED_HEADER}\n\n`;
  const placedCode = (placement: CodePlacement) => (placed.get(placement) ?? []).join("\n\n");
  // A script with a `params { }` block can't also set `params.x = …`: N-WAVE's go into the block.
  const scriptCode = placedCode("script");
  const merged = mergeIntoParamsBlock(scriptCode, paramsScript);
  if (merged) {
    placed.set("script", [merged]);
    paramsScript = "";
  }
  if (paramsScript) finalScript += `${paramsScript}\n`;
  if (nextflowConfigBlocks.length > 0 || paramConfigLines.length > 0) {
    let config = "";
    if (paramConfigLines.length > 0) {
      config += `params {\n${paramConfigLines.map((line) => `  ${line}`).join("\n")}\n}\n`;
    }
    if (nextflowConfigBlocks.length > 0) {
      config += "process {\n";
      config += Array.from(new Set(nextflowConfigBlocks))
        .map((block) =>
          block
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")
        )
        .join("\n\n");
      config += "\n}";
    }
    // Settings for nextflow.config (runs and "Export project" move them
    // there). `*/` in a value would end the comment; the extractors undo this.
    finalScript += `/* N-WAVE_NEXTFLOW_CONFIG\n${config.replace(/\*\//g, "*\\/")}\n*/\n\n`;
  }
  const uniqueIncludeStatements = Array.from(new Set(includeStatements));
  if (uniqueIncludeStatements.length > 0) {
    finalScript += `${uniqueIncludeStatements.join("\n")}\n\n`;
  }
  if (placedCode("script")) finalScript += `${placedCode("script")}\n\n`;

  // Notes: comments before the workflow, so they come back on import.
  let noteCount = 0;
  for (const node of nodes) {
    if (node.type !== "note") continue;
    noteCount += 1;
    layoutNames.set(node.id, `note_${noteCount}`);
    const text = String(node.data.noteText ?? "").replace(/\*\//g, "* /").trimEnd();
    noteComments.push(`/* Note: ${String(node.data.label || "Note").replace(/\n/g, " ").replace(/\*\//g, "* /")}\n${text}\n*/`);
  }

  const workflowBody = [...assignedCalls].reduce(
    (body, [processName, variable]) => body.replace(new RegExp(`^( *)${processName}\\(`, "m"), `$1${variable} = ${processName}(`),
    naturalize(
      [inputScript.trimEnd() ? `${indent(inputScript.trimEnd())}\n\n` : "", ...stepStatements, ...outputStatements].join(""),
      new Set(processNames.values()),
    ),
  );

  // Helper functions the generated code calls (top-level, strict syntax).
  const helperFunctions = helperFunctionsFor([workflowBody, ...processScripts].join("\n"));
  if (helperFunctions.length > 0) {
    finalScript += `${helperFunctions.join("\n\n")}\n\n`;
  }

  // Steps can bring the same definitions (a shared helper workflow or function): each once.
  // Functions of the same name from different files: one script can hold one.
  // Functions first, as an imported script's own functions are.
  const functionNames = new Set<string>();
  const functionName = (definition: string) =>
    stripLeadingComments(definition).match(/^def\s+(?:[\w<>,[\]]+\s+)?([A-Za-z_]\w*)\s*\(/)?.[1];
  const definitions = Array.from(new Set(processScripts.flatMap(definitionsOf))).filter((definition) => {
    const name = functionName(definition);
    if (!name) return true;
    if (functionNames.has(name)) return false;
    functionNames.add(name);
    return true;
  });
  const uniqueProcessScripts = [
    ...definitions.filter((definition) => functionName(definition)),
    ...definitions.filter((definition) => !functionName(definition)),
  ];
  if (uniqueProcessScripts.length > 0) {
    finalScript += `${uniqueProcessScripts.map(tidyBlock).join("\n\n")}\n\n`;
  }

  if (noteComments.length > 0) finalScript += `${noteComments.join("\n\n")}\n\n`;

  // Sections after main: (publish:, onComplete:, onError:) need main: written.
  const sections = (["publish", "onComplete", "onError"] as const).filter((placement) => placedCode(placement));
  const main = workflowBody.replace(/^\n+/, "").replace(/\n+$/, "");
  finalScript += `workflow {\n${sections.length > 0 ? `    main:\n${main}` : main}\n`;
  for (const section of sections) finalScript += `\n    ${section}:\n${indent(placedCode(section))}\n`;
  finalScript += "}\n";
  if (placedCode("end")) finalScript += `\n${placedCode("end")}\n`;

  if (options.layout !== false && nodes.length > 0) {
    // In the order of the code (inputs, steps), notes last: the same after an import.
    const placed = [...order.filter((node) => node.type !== "note"), ...nodes.filter((node) => node.type === "note")];
    finalScript += `\n${formatLayoutComment(placed, layoutNames)}\n`;
  }

  return { script: finalScript.replace(/\n{3,}/g, "\n\n"), names: layoutNames };
};

const stripLeadingComments = (text: string): string =>
  text.replace(/^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*/, "");

/** A step's code split into its top-level definitions (with their comments). */
const definitionsOf = (code: string): string[] => {
  const items = topLevelItems(code);
  if (items.length <= 1) return [code];
  return items.map((item) => [...item.comments, item.text].join("\n"));
};

/**
 * Code with a `params { }` block, with the `params.x = …` lines added to it
 * (those it doesn't declare already); null when there is no block.
 */
const mergeIntoParamsBlock = (code: string, paramLines: string): string | null => {
  const masked = maskSource(code);
  const start = masked.search(/^params\s*\{/m);
  if (start === -1) return null;
  const open = masked.indexOf("{", start);
  const close = closingBracket(masked, open);
  if (close === -1) return null;
  const body = code.slice(open + 1, close);
  const indentation = body.match(/\n([ \t]+)\S/)?.[1] ?? "    ";
  const declared = new Set([...body.matchAll(/^\s*([A-Za-z_]\w*)\s*[:=]/gm)].map((match) => match[1]));
  const entries = paramLines
    .split("\n")
    .map((line) => line.match(/^params\.([A-Za-z_]\w*) = (.*)$/))
    .filter((match): match is RegExpMatchArray => match !== null && !declared.has(match[1]))
    .map((match) => `${indentation}${match[1]} = ${match[2]}`);
  if (entries.length === 0) return code;
  return `${code.slice(0, open + 1)}\n${entries.join("\n")}${body.startsWith("\n") ? "" : "\n"}${body}${code.slice(close)}`;
};

/** What the items coming over a connection look like. */
export const itemShape = (edge: Edge, nodes: Node<NodeData>[]): ItemShape => {
  const source = nodes.find((node) => node.id === edge.source);
  if (!source) return "unknown";
  if (FILE_OUTPUT_TYPES.has(String(source.type)) || source.type === "parameters") return "file";
  if (source.type === "samplesheet") return "meta";
  // nf-core outputs, as the module declares them (older saved nodes lack it).
  const port = [
    ...(getNodeDefinitionForNode(source)?.outputs ?? []),
    ...(source.data.outputs ?? []),
  ].find((output) => output.name === edge.sourceHandle);
  return port?.metaTuple ? "meta" : "unknown";
};

/** Every line indented by four spaces. */
const indent = (text: string): string =>
  text
    .split("\n")
    .map((line) => (line ? `    ${line}` : line))
    .join("\n");

/** A process block with its closing brace back at the start of the line. */
const tidyBlock = (block: string): string => block.trim().replace(/\n[ \t]+\}$/, "\n}");

/**
 * The nodes in the order their code is written: every node after the ones it
 * reads from; among nodes that are ready, left to right, then top to bottom.
 */
export const stepOrder = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  names: Map<string, string> = processNamesFor(nodes),
): Node<NodeData>[] => {
  const ids = new Set(nodes.map((node) => node.id));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target) {
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
  }
  const position = (node: Node) => node.position ?? { x: 0, y: 0 };
  // Ties (same place) by name, which an import keeps, unlike ids.
  const name = (node: Node) => names.get(node.id) ?? node.id;
  const before = (left: Node, right: Node) =>
    position(left).x - position(right).x ||
    position(left).y - position(right).y ||
    (name(left) < name(right) ? -1 : name(left) > name(right) ? 1 : 0);
  const ready = nodes.filter((node) => indegree.get(node.id) === 0);
  const ordered: Node<NodeData>[] = [];
  while (ready.length > 0) {
    ready.sort(before);
    const node = ready.shift() as Node<NodeData>;
    ordered.push(node);
    for (const edge of edges) {
      if (edge.source !== node.id || !ids.has(edge.target) || edge.target === node.id) continue;
      const remaining = (indegree.get(edge.target) ?? 0) - 1;
      indegree.set(edge.target, remaining);
      if (remaining === 0) ready.push(nodes.find((candidate) => candidate.id === edge.target) as Node<NodeData>);
    }
  }
  // Nodes in a loop (the check above refuses those) keep their place.
  for (const node of nodes) if (!ordered.includes(node)) ordered.push(node);
  return ordered;
};

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/;

/**
 * Write the workflow body the way a person would: `STEP(...)` instead of
 * `x = STEP(...)`, and `STEP.out.reads` instead of a variable that only
 * renames it.
 */
export const naturalize = (body: string, processNames: Set<string>): string => {
  const aliases = new Map<string, string>();
  const kept: string[] = [];
  for (const line of body.split("\n")) {
    // `x = STEP(args)` → `STEP(args)`, x is STEP.out
    const call = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\((.*)\)\s*$/);
    if (call && processNames.has(call[3]) && balanced(call[4])) {
      aliases.set(call[2], `${call[3]}.out`);
      kept.push(`${call[1]}${call[3]}(${call[4]})`);
      continue;
    }
    // `(a, b) = STEP(args)` → `STEP(args)`, a is STEP.out[0]
    const tuple = line.match(/^(\s*)\(([^)]*)\)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\((.*)\)\s*$/);
    if (tuple && processNames.has(tuple[3]) && balanced(tuple[4])) {
      tuple[2]
        .split(",")
        .map((name) => name.trim())
        .forEach((name, index) => {
          if (IDENTIFIER.test(name)) aliases.set(name, `${tuple[3]}.out[${index}]`);
        });
      kept.push(`${tuple[1]}${tuple[3]}(${tuple[4]})`);
      continue;
    }
    // `x = STEP.out.reads` → (dropped), x is STEP.out.reads
    const output = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*\.out(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])?)\s*$/);
    if (output && processNames.has(output[2].split(".")[0])) {
      aliases.set(output[1], output[2]);
      continue;
    }
    kept.push(line);
  }
  // `channel.of(...)`: Nextflow deprecates the upper-case `Channel`.
  const modern = kept.map((line) =>
    replaceOutsideStrings(line, /(?<![.\w])Channel\.(?=[a-zA-Z]+\()/g, () => "channel."),
  );
  kept.splice(0, kept.length, ...modern);
  if (aliases.size === 0) return kept.join("\n");
  const pattern = new RegExp(`(?<![.\\w])(${[...aliases.keys()].map(escapeRegExp).join("|")})(?!\\w)`, "g");
  return kept.map((line) => replaceOutsideStrings(line, pattern, (name) => aliases.get(name) ?? name)).join("\n");
};

const balanced = (text: string): boolean => {
  let depth = 0;
  for (const char of text) {
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace matches of `pattern` in a line, but not inside '…' or "…" strings. */
const replaceOutsideStrings = (
  line: string,
  pattern: RegExp,
  replace: (match: string) => string,
): string =>
  line
    .split(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(pattern, replace)))
    .join("");

function resolveChannelNameForEdge(
  edge: Edge,
  channelNameMap: Map<string, string>
): string | null {
  const upstreamChannelName = channelNameMap.get(`${edge.source}.${edge.sourceHandle}`);
  if (upstreamChannelName) return upstreamChannelName;

  if (edge.sourceHandle?.includes("_")) {
    const outputName = edge.sourceHandle.split("_").pop();
    const alternative = channelNameMap.get(`${edge.source}.${outputName}`);
    if (alternative) return alternative;
  }
  for (const [key, value] of channelNameMap.entries()) {
    if (key.startsWith(`${edge.source}.`)) return value;
  }
  return null;
}

/**
 * The process (or nf-core alias) name a node runs as. With the workflow's
 * nodes it is the name the script uses (named after the label, unique);
 * without, the name scripts from before 1.6 used.
 */
export function getProcessNameForNode(node: Node, nodes?: Node[]): string {
  if (nodes) {
    const name = processNamesFor(nodes).get(node.id);
    if (name) return name;
  }
  return legacyProcessNameForNode(node);
}

/** Process name scripts from before 1.6 used, e.g. "filter_node_123". */
export function legacyProcessNameForNode(node: Node): string {
  let type = node.data.processType || node.data.operatorType || node.type;
  if (!type || typeof type !== "string" || type === "undefined") {
    type = "process";
  }
  // A Nextflow identifier: node pack ids may hold dots or start with a digit.
  const name = `${type}_${node.id.replace(/[\s-]+/g, "_")}`.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(name) ? name : `p_${name}`;
}

export { buildMixedChannelExpression };

export function sanitizeVarName(name: string): string {
  if (typeof name !== "string") return "";
  let sanitized = name.replace(/[-\s]+/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `v_${sanitized}`;
  }
  return sanitized;
}
