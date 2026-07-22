import type { Edge, Node } from "reactflow";
import type { NodeData, PortData } from "../components/nodes/BaseNode";
import CustomNodePanel from "../components/panels/process/CustomNodePanel";
import type { NodeDefinition } from "./nodeDefinitions";
import {
  registerDynamicNodeDefinitions,
  unregisterDynamicNodeDefinitions,
} from "./nodeDefinitions";
import type { NodeGenerator } from "./nodeGeneration";

export type CustomNodeInputKind = "path" | "val";
export type CustomNodeSettingType =
  | "text"
  | "integer"
  | "float"
  | "boolean"
  | "select";

export interface CustomNodeInput {
  name: string;
  kind: CustomNodeInputKind;
  label: string;
  fileType?: string;
  filePattern?: string;
  defaultValue?: string;
  settingType?: CustomNodeSettingType;
  options?: string[];
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
  label: string;
  description: string;
  icon: string;
  processType: string;
  processName: string;
  source: string;
  inputs: CustomNodeInput[];
  outputs: CustomNodeOutput[];
  arguments: CustomNodeArgument[];
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
  processName: string;
  inputs: CustomNodeInput[];
  outputs: CustomNodeOutput[];
  arguments: CustomNodeArgument[];
  warnings: string[];
}

export const parseCustomNodeSource = (
  source: string
): ParsedCustomNodeSource => {
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
    argument.fields.forEach((field) => {
      if (field.meta) return;
      if (inputMap.has(field.name)) return;

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
    });
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
    label: draft.label || parsed.processName || "Custom Node",
    description: draft.description || "User-defined Nextflow process.",
    icon: draft.icon || "Code",
    processType: id,
    processName: parsed.processName,
    source: draft.source,
    inputs: overrides.inputs,
    outputs: overrides.outputs,
    arguments: parsed.arguments,
    createdAt: existingNode?.createdAt ?? now,
    updatedAt: now,
  };

  return stored;
};

const registeredCustomNodeIds = new Set<string>();

export const registerCustomNodes = (nodes: StoredCustomNode[]): void => {
  nodes.forEach((node) => {
    registeredCustomNodeIds.add(node.id);
  });
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

const createNodeDefinitionFromCustomNode = (
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
    const source = renameProcess(customNode.source, customNode.processName, processName);
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

    return {
      processScript: source,
      channelDefinitions: argumentChannels
        .map((channel) => channel.definition)
        .filter((definition): definition is string => Boolean(definition)),
      processInvocations: [invocation],
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
      channels.push({ name: upstream });
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
    "        def meta = [id: firstPath.baseName]",
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
  splitTopLevel(declaration.replace(/^tuple\s+/, "")).forEach((token) => {
      const valName = token.match(/^val\(([^)]+)\)$/)?.[1]?.trim();
      if (valName) {
        fields.push({
          kind: "val",
          name: valName,
          meta: /^meta\d*$/.test(valName),
        });
        return;
      }

      const pathName = token.match(/^path\(\s*([A-Za-z_][A-Za-z0-9_]*)/)?.[1];
      if (pathName) fields.push({ kind: "path", name: pathName });
    });

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

const stripLineComment = (value: string): string => {
  const index = value.indexOf("//");
  return index === -1 ? value : value.slice(0, index);
};

const renameProcess = (
  source: string,
  originalProcessName: string,
  nextProcessName: string
): string =>
  source.replace(
    new RegExp(`\\bprocess\\s+${escapeRegExp(originalProcessName)}\\b`),
    `process ${nextProcessName}`
  );

const groovyLiteral = (value: string): string =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const groovyLiteralForSetting = (
  value: string,
  setting?: CustomNodeInput
): string => {
  const type = setting?.settingType ?? "text";
  if (type === "boolean") return value === "true" ? "true" : "false";
  if (type === "integer") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? String(parsed) : "0";
  }
  if (type === "float") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? String(parsed) : "0";
  }
  return groovyLiteral(value);
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
