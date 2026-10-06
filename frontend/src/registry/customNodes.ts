import type { Edge, Node } from "reactflow";
import type { NodeData, PortData } from "../components/nodes/BaseNode";
import CustomNodePanel from "../components/panels/process/CustomNodePanel";
import type { NodeDefinition } from "./nodeDefinitions";
import {
  registerDynamicNodeDefinitions,
  unregisterDynamicNodeDefinitions,
} from "./nodeDefinitions";
import {
  emptyChannelFor,
  extractRootIncludes,
  parseWorkflowSignature,
} from "./nfcore/subworkflowSource";
import type { NodeGenerator } from "./nodeGeneration";
import { groovyStringWithParams } from "./params";

export type CustomNodeInputKind = "path" | "val";
export type CustomNodeSettingType =
  | "text"
  | "integer"
  | "float"
  | "boolean"
  | "select"
  /** Passed as written, e.g. `[]` or `['a', 'b']`. */
  | "expression";

export interface CustomNodeInput {
  name: string;
  kind: CustomNodeInputKind;
  label: string;
  fileType?: string;
  filePattern?: string;
  defaultValue?: string;
  settingType?: CustomNodeSettingType;
  options?: string[];
  /** Pass all upstream files to one task (`.collect()`), like Merge does. */
  collect?: boolean;
  /**
   * Workflow nodes: the expression passed for a channel input while nothing
   * is connected, e.g. `Channel.value([])`.
   */
  emptyValue?: string;
}

export interface CustomNodeOutput {
  name: string;
  emit: string;
  label: string;
  fileType?: string;
  filePattern?: string;
}

export interface CustomNodeArgumentField {
  kind: CustomNodeInputKind;
  name: string;
  meta?: boolean;
}

export interface CustomNodeArgument {
  kind: "path" | "val" | "tuple";
  name: string;
  fields: CustomNodeArgumentField[];
}

export interface StoredCustomNode {
  id: string;
  /**
   * "workflow" when the source is a named Nextflow workflow (e.g. a
   * converted nf-core subworkflow) instead of a process.
   */
  kind?: "process" | "workflow";
  label: string;
  description: string;
  icon: string;
  processType: string;
  processName: string;
  source: string;
  inputs: CustomNodeInput[];
  outputs: CustomNodeOutput[];
  arguments: CustomNodeArgument[];
  /**
   * Process config statements (e.g. `ext.args = '--nogroup'`), emitted as a
   * `withName` block. Used when converting nf-core nodes. For workflow nodes
   * these are whole config lines (selectors included), emitted as written.
   */
  config?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomNodeDraft {
  label: string;
  description: string;
  icon: string;
  source: string;
}

export interface ParsedCustomNodeSource {
  kind?: "process" | "workflow";
  /** The process name, or the workflow name for workflow sources. */
  processName: string;
  inputs: CustomNodeInput[];
  outputs: CustomNodeOutput[];
  arguments: CustomNodeArgument[];
  warnings: string[];
}

// Take comments (`// val: ...`, `// bool: ...`) that mark a workflow take
// as a value setting rather than a channel.
const VALUE_TAKE_TYPES: Record<string, CustomNodeSettingType> = {
  val: "text",
  value: "text",
  string: "text",
  bool: "boolean",
  boolean: "boolean",
  integer: "integer",
  int: "integer",
  float: "float",
  number: "float",
};

/**
 * Parse a named workflow (an nf-core subworkflow, say): channel takes become
 * input ports, value takes settings and emits outputs.
 */
const parseWorkflowSource = (source: string): ParsedCustomNodeSource => {
  const signature = parseWorkflowSignature(source);
  const inputs: CustomNodeInput[] = signature.takes.map(({ name, comment }) => {
    const settingType =
      VALUE_TAKE_TYPES[comment.match(/^([A-Za-z]+)/)?.[1]?.toLowerCase() ?? ""];
    return settingType
      ? {
          name,
          kind: "val",
          label: toTitle(name),
          settingType,
          defaultValue: settingType === "boolean" ? "false" : "",
        }
      : {
          name,
          kind: "path",
          label: toTitle(name),
          fileType: inferFileType(comment),
          emptyValue: emptyChannelFor(comment),
        };
  });
  return {
    kind: "workflow",
    processName: signature.name,
    inputs,
    outputs: signature.emits.map((emit) => ({
      name: emit,
      emit,
      label: toTitle(emit),
    })),
    arguments: inputs.map((input) => ({
      kind: input.kind,
      name: input.name,
      fields: [{ kind: input.kind, name: input.name }],
    })),
    warnings:
      signature.emits.length === 0 ? ["The workflow emits no channels."] : [],
  };
};

export const parseCustomNodeSource = (
  source: string
): ParsedCustomNodeSource => {
  if (
    !/\bprocess\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/.test(source) &&
    /^\s*workflow\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/m.test(source)
  ) {
    return parseWorkflowSource(source);
  }
  const processName =
    source.match(/\bprocess\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/m)?.[1] ?? "";
  const inputDeclarations = getSectionLines(source, "input");
  const outputDeclarations = getSectionLines(source, "output");
  const inputMap = new Map<string, CustomNodeInput>();
  const argumentList: CustomNodeArgument[] = [];
  const warnings: string[] = [];

  inputDeclarations.forEach((declaration, index) => {
    const argument = parseInputDeclaration(declaration, index);
    if (!argument) {
      warnings.push(`Could not infer input: ${declaration}`);
      return;
    }

    argumentList.push(argument);
    for (const field of argument.fields) {
      if (field.meta) continue;
      if (inputMap.has(field.name)) continue;

      inputMap.set(field.name, {
        name: field.name,
        kind: field.kind,
        label: toTitle(field.name),
        fileType: field.kind === "path" ? inferFileType(field.name) : undefined,
        filePattern:
          field.kind === "path" ? inferFilePattern(field.name) : undefined,
        defaultValue:
          field.kind === "val" ? inferSettingDefault(field.name) : undefined,
        settingType:
          field.kind === "val" ? inferSettingType(field.name) : undefined,
      });
    }
  });

  const outputs = outputDeclarations
    .map((declaration, index) => parseOutputDeclaration(declaration, index))
    .filter((output): output is CustomNodeOutput => Boolean(output));

  return {
    processName,
    inputs: Array.from(inputMap.values()),
    outputs:
      outputs.length > 0
        ? outputs
        : [{ name: "out", emit: "out", label: "Output" }],
    arguments: argumentList,
    warnings,
  };
};

export const createStoredCustomNode = (
  draft: CustomNodeDraft,
  parsed: ParsedCustomNodeSource,
  overrides: {
    inputs: CustomNodeInput[];
    outputs: CustomNodeOutput[];
  },
  existingNode?: StoredCustomNode
): StoredCustomNode => {
  const now = new Date().toISOString();
  const id =
    existingNode?.id ??
    `custom_${slugify(draft.label || parsed.processName || "node")}_${Date.now()}`;
  const stored: StoredCustomNode = {
    id,
    ...(parsed.kind === "workflow" ? { kind: "workflow" as const } : {}),
    label: draft.label || parsed.processName || "Custom Node",
    description:
      draft.description ||
      (parsed.kind === "workflow"
        ? "User-defined Nextflow workflow."
        : "User-defined Nextflow process."),
    icon: draft.icon || "Code",
    processType: id,
    processName: parsed.processName,
    source: draft.source,
    // Keep settings the editor doesn't expose (collect, placeholders,
    // config) on edit.
    inputs: overrides.inputs.map((input) => {
      const previous = existingNode?.inputs.find(
        (candidate) => candidate.name === input.name
      );
      const kept =
        input.collect === undefined && previous?.collect
          ? { ...input, collect: true }
          : input;
      return input.kind === "path" && previous?.emptyValue !== undefined
        ? { ...kept, emptyValue: previous.emptyValue }
        : kept;
    }),
    outputs: overrides.outputs,
    arguments: parsed.arguments,
    ...(existingNode?.config ? { config: existingNode.config } : {}),
    createdAt: existingNode?.createdAt ?? now,
    updatedAt: now,
  };

  return stored;
};

const registeredCustomNodeIds = new Set<string>();

export const registerCustomNodes = (nodes: StoredCustomNode[]): void => {
  for (const node of nodes) {
    registeredCustomNodeIds.add(node.id);
  }
  registerDynamicNodeDefinitions(nodes.map(createNodeDefinitionFromCustomNode));
};

export const syncCustomNodes = (nodes: StoredCustomNode[]): void => {
  unregisterDynamicNodeDefinitions(Array.from(registeredCustomNodeIds));
  registeredCustomNodeIds.clear();
  registerCustomNodes(nodes);
};

export const unregisterCustomNode = (id: string): void => {
  registeredCustomNodeIds.delete(id);
  unregisterDynamicNodeDefinitions([id]);
};

export const createNodeDefinitionFromCustomNode = (
  customNode: StoredCustomNode
): NodeDefinition => {
  const pathInputs = customNode.inputs.filter((input) => input.kind === "path");
  const valueInputs = customNode.inputs.filter((input) => input.kind === "val");
  const inputs: PortData[] = pathInputs.map((input) => ({
    name: input.name,
    label: input.label,
    fileType: input.fileType,
    filePattern: input.filePattern,
    isConnectable: true,
  }));
  const outputs: PortData[] = customNode.outputs.map((output) => ({
    name: output.name,
    label: output.label,
    fileType: output.fileType,
    filePattern: output.filePattern,
    isConnectable: true,
  }));

  return {
    id: customNode.id,
    kind: "process",
    category: "Custom",
    label: customNode.label,
    description: customNode.description,
    type: "process",
    icon: customNode.icon,
    processType: customNode.processType,
    inputs,
    outputs,
    defaults: {
      label: customNode.label,
      subtitle: "Custom node",
      icon: customNode.icon,
      processType: customNode.processType,
      customNodeId: customNode.id,
      customNodeDefinition: customNode,
      customNodeValues: Object.fromEntries(
        valueInputs.map((input) => [input.name, input.defaultValue ?? ""])
      ),
      customNodeValueInputs: valueInputs,
      inputs,
      outputs,
    },
    panel: CustomNodePanel,
    generateNextflow: generateCustomNode(customNode),
    executionLabel: customNode.label,
  };
};

const generateCustomNode =
  (customNode: StoredCustomNode): NodeGenerator =>
  (context) => {
    const { node, processName, incomingEdges, resolveChannelNameForEdge, channelNameMap } =
      context;
    const isWorkflow = customNode.kind === "workflow";
    // A workflow's includes are relative to its nf-core folder; move them to
    // the top of the script, relative to main.nf.
    const { includes, source: body } = isWorkflow
      ? extractRootIncludes(customNode.source)
      : { includes: [], source: customNode.source };
    const source = renameProcess(
      body,
      customNode.processName,
      processName,
      isWorkflow ? "workflow" : "process"
    );
    const argumentChannels = buildArgumentChannels({
      customNode,
      node,
      processName,
      incomingEdges,
      resolveChannelNameForEdge,
      channelNameMap,
      sanitizeVarName: context.sanitizeVarName,
    });

    if (!argumentChannels) return null;

    const outputAssignments = customNode.outputs.map((output) => {
      const outputVar =
        context.channelNameMap.get(`${node.id}.${output.name}`) ??
        context.sanitizeVarName(`${processName}_${output.name}`);
      const outputRef = output.emit
        ? `${processName}.out.${output.emit}`
        : `${processName}.out`;
      return `    ${outputVar} = ${outputRef}\n`;
    });
    const invocation = [
      `    ${processName}(${argumentChannels
        .map((channel) => channel.name)
        .join(", ")})\n`,
      ...outputAssignments,
    ].join("");

    const configStatements = (customNode.config ?? []).filter(
      (statement) => statement.trim() !== ""
    );

    return {
      processScript: source,
      ...(includes.length > 0 ? { includeStatements: includes } : {}),
      channelDefinitions: argumentChannels
        .map((channel) => channel.definition)
        .filter((definition): definition is string => Boolean(definition)),
      processInvocations: [invocation],
      nextflowConfigBlocks:
        configStatements.length === 0
          ? undefined
          : isWorkflow
            ? [customNode.config?.join("\n").trim() ?? ""]
            : [
                [
                  `withName: '${processName}' {`,
                  ...configStatements.map((statement) => `  ${statement.trim()}`),
                  "}",
                ].join("\n"),
              ],
    };
  };

const buildArgumentChannels = ({
  customNode,
  node,
  processName,
  incomingEdges,
  resolveChannelNameForEdge,
  channelNameMap,
  sanitizeVarName,
}: {
  customNode: StoredCustomNode;
  node: Node<NodeData>;
  processName: string;
  incomingEdges: Edge[];
  resolveChannelNameForEdge: (
    edge: Edge,
    channelNameMap: Map<string, string>
  ) => string | null;
  channelNameMap: Map<string, string>;
  sanitizeVarName: (name: string) => string;
}): Array<{ name: string; definition?: string }> | null => {
  const valueInputs = node.data.customNodeValues ?? {};
  const settingsByName = new Map(
    customNode.inputs
      .filter((input) => input.kind === "val")
      .map((input) => [input.name, input])
  );
  const channels: Array<{ name: string; definition?: string }> = [];

  if (customNode.kind === "workflow") {
    // Workflow takes: connected channels, or the input's placeholder while
    // unconnected; needs at least one connection.
    const inputsByName = new Map(
      customNode.inputs.map((input) => [input.name, input])
    );
    let connected = 0;
    for (const argument of customNode.arguments) {
      const input = inputsByName.get(argument.name);
      if (argument.kind === "val") {
        channels.push({
          name: groovyLiteralForSetting(
            String(valueInputs[argument.name] ?? input?.defaultValue ?? ""),
            input
          ),
        });
        continue;
      }
      const upstream = resolvePathInput(
        argument.name,
        incomingEdges,
        resolveChannelNameForEdge,
        channelNameMap
      );
      if (upstream) connected += 1;
      channels.push({
        name: upstream ?? input?.emptyValue ?? "Channel.empty()",
      });
    }
    return connected > 0 ? channels : null;
  }

  for (const argument of customNode.arguments) {
    if (argument.kind === "val") {
      const value = valueInputs[argument.name] ?? "";
      channels.push({
        name: groovyLiteralForSetting(String(value), settingsByName.get(argument.name)),
      });
      continue;
    }

    if (argument.kind === "path") {
      const upstream = resolvePathInput(
        argument.name,
        incomingEdges,
        resolveChannelNameForEdge,
        channelNameMap
      );
      if (!upstream) return null;
      const collect = customNode.inputs.some(
        (input) => input.name === argument.name && input.collect
      );
      channels.push({ name: collect ? `${upstream}.collect()` : upstream });
      continue;
    }

    const pathFields = argument.fields.filter((field) => field.kind === "path");
    const upstreams = pathFields.map((field) =>
      resolvePathInput(
        field.name,
        incomingEdges,
        resolveChannelNameForEdge,
        channelNameMap
      )
    );
    if (upstreams.some((upstream) => !upstream)) return null;

    const channelName = sanitizeVarName(
      `ch_${processName}_${argument.name}_custom_tuple`
    );
    channels.push({
      name: channelName,
      definition: buildTupleDefinition({
        channelName,
        argument,
        upstreams: upstreams as string[],
        values: valueInputs,
        settingsByName,
      }),
    });
  }

  return channels;
};

const resolvePathInput = (
  handle: string,
  incomingEdges: Edge[],
  resolveChannelNameForEdge: (
    edge: Edge,
    channelNameMap: Map<string, string>
  ) => string | null,
  channelNameMap: Map<string, string>
): string | null => {
  const edge = incomingEdges.find((candidate) => candidate.targetHandle === handle);
  if (!edge) return null;
  return resolveChannelNameForEdge(edge, channelNameMap);
};

const buildTupleDefinition = ({
  channelName,
  argument,
  upstreams,
  values,
  settingsByName,
}: {
  channelName: string;
  argument: CustomNodeArgument;
  upstreams: string[];
  values: Record<string, unknown>;
  settingsByName: Map<string, CustomNodeInput>;
}): string => {
  const expression = upstreams
    .slice(1)
    .reduce((current, upstream) => `${current}.combine(${upstream})`, upstreams[0]);
  const args = upstreams.map((_, index) => `item${index}`);
  let pathIndex = 0;

  const lines = argument.fields.map((field) => {
    if (field.meta) return "meta";
    if (field.kind === "path") {
      const argName = args[pathIndex];
      pathIndex += 1;
      return `extractCustomPath(${argName})`;
    }
    return groovyLiteralForSetting(
      String(values[field.name] ?? ""),
      settingsByName.get(field.name)
    );
  });

  return [
    `    ${channelName} = ${expression}.map { ${args.join(", ")} ->`,
    "        def extractCustomPath = { item -> item instanceof List && item.size() > 0 ? item[-1] : item }",
    `        def firstPath = extractCustomPath(${args[0]})`,
    "        def meta = [id: (firstPath instanceof List ? firstPath[0] : firstPath).baseName]",
    `        tuple(${lines.join(", ")})`,
    "    }\n",
  ].join("\n");
};

const getSectionLines = (source: string, section: string): string[] => {
  const block =
    source.match(
      new RegExp(
        `^\\s*${section}:\\s*$([\\s\\S]*?)(?=^\\s*(input|output|when|script|shell|stub|publishDir|label|conda|container|cpus|memory|time):\\s*$|^\\s*}\\s*$)`,
        "m"
      )
    )?.[1] ?? "";

  return block
    .split(/\r?\n/)
    .map(stripLineComment)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^(tuple|path|val|env|stdin)\b/.test(line));
};

const parseInputDeclaration = (
  declaration: string,
  index: number
): CustomNodeArgument | null => {
  if (declaration.startsWith("path ")) {
    const name = declaration.match(/^path\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
    if (!name) return null;
    return { kind: "path", name, fields: [{ kind: "path", name }] };
  }

  if (declaration.startsWith("val ")) {
    const name = declaration.match(/^val\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
    if (!name) return null;
    return { kind: "val", name, fields: [{ kind: "val", name }] };
  }

  if (!declaration.startsWith("tuple ")) return null;

  const fields: CustomNodeArgumentField[] = [];
  for (const token of splitTopLevel(declaration.replace(/^tuple\s+/, ""))) {
      const valName = token.match(/^val\(([^)]+)\)$/)?.[1]?.trim();
      if (valName) {
        fields.push({
          kind: "val",
          name: valName,
          meta: /^meta\d*$/.test(valName),
        });
        continue;
      }

      const pathName = token.match(/^path\(\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
      if (pathName) fields.push({ kind: "path", name: pathName });
    }

  if (fields.length === 0) return null;
  return {
    kind: "tuple",
    name:
      fields.find((field) => field.kind === "path")?.name ??
      `tuple_${index + 1}`,
    fields,
  };
};

const parseOutputDeclaration = (
  declaration: string,
  index: number
): CustomNodeOutput | null => {
  const emit = declaration.match(/\bemit:\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "";
  const name = emit || (index === 0 ? "out" : "");
  if (!name) return null;

  return {
    name,
    emit,
    label: toTitle(name),
    fileType: inferFileType(declaration),
    filePattern: inferFilePattern(declaration),
  };
};

const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";

  for (const char of value) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
};

/** Drop a trailing `// comment`, ignoring `//` inside quoted strings. */
export const stripLineComment = (value: string): string => {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "/" && value[index + 1] === "/") {
      return value.slice(0, index);
    }
  }
  return value;
};

const renameProcess = (
  source: string,
  originalProcessName: string,
  nextProcessName: string,
  keyword: "process" | "workflow" = "process"
): string =>
  source.replace(
    new RegExp(`\\b${keyword}\\s+${escapeRegExp(originalProcessName)}\\b`),
    `${keyword} ${nextProcessName}`
  );

const groovyLiteralForSetting = (
  value: string,
  setting?: CustomNodeInput
): string => {
  const type = setting?.settingType ?? "text";
  if (type === "boolean") return value === "true" ? "true" : "false";
  if (type === "expression") return value.trim() || "[]";
  if (type === "integer") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? String(parsed) : "0";
  }
  if (type === "float") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? String(parsed) : "0";
  }
  return groovyStringWithParams(value);
};

const toTitle = (value: string): string =>
  value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const inferFilePattern = (value: string): string | undefined => {
  const pathPattern = value.match(/path\s+["']([^"']+)["']/)?.[1];
  if (pathPattern) return pathPattern;
  const lower = value.toLowerCase();
  if (lower.includes("fastq") || lower.includes("fq")) return "*.fastq.gz";
  if (lower.includes("fasta") || lower.includes("fa")) return "*.fa.gz";
  if (lower.includes("bam")) return "*.bam";
  if (lower.includes("sam")) return "*.sam";
  if (lower.includes("vcf")) return "*.vcf.gz";
  if (lower.includes("bed")) return "*.bed";
  if (lower.includes("html")) return "*.html";
  if (lower.includes("json")) return "*.json";
  if (lower.includes("tsv")) return "*.tsv";
  if (lower.includes("csv")) return "*.csv";
  if (lower.includes("txt")) return "*.txt";
  return undefined;
};

const inferFileType = (value: string): string | undefined => {
  const lower = value.toLowerCase();
  if (lower.includes("fastq") || lower.includes("fq")) return "FASTQ";
  if (lower.includes("fasta") || lower.includes("fa")) return "FASTA";
  if (lower.includes("bam")) return "BAM";
  if (lower.includes("sam")) return "SAM";
  if (lower.includes("vcf")) return "VCF";
  if (lower.includes("bed")) return "BED";
  if (lower.includes("html")) return "HTML";
  if (lower.includes("json")) return "JSON";
  if (lower.includes("tsv")) return "TSV";
  if (lower.includes("csv")) return "CSV";
  if (lower.includes("txt")) return "TXT";
  return undefined;
};

const inferSettingType = (name: string): CustomNodeSettingType => {
  const lower = name.toLowerCase();
  if (/^(is_|has_|use_|enable_|disable_)/.test(lower)) return "boolean";
  if (/(threads|cpus|cores|count|lines|length|size|min|max|limit)$/.test(lower)) {
    return "integer";
  }
  if (/(ratio|rate|threshold|fraction|percent|score)$/.test(lower)) {
    return "float";
  }
  return "text";
};

const inferSettingDefault = (name: string): string => {
  if (name.toLowerCase() === "max_lines") return "20";
  const type = inferSettingType(name);
  if (type === "boolean") return "false";
  if (type === "integer") return "1";
  if (type === "float") return "0";
  return "";
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
