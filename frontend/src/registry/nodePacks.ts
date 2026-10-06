// Node packs: custom nodes shared as data. A pack is a versioned JSON file
// holding one or more custom nodes (source, ports, settings, metadata) plus
// the nf-core modules and subworkflows they include. Importing a pack stores
// its nodes like any custom node (backend in Docker installs, browser storage
// in the demo), each tagged with the pack it came from.

import { getSubworkflowIncludes } from "./nfcore/subworkflowSource";
import {
  type CustomNodeArgument,
  type CustomNodeInput,
  type CustomNodeOutput,
  type CustomNodeSettingType,
  parseCustomNodeSource,
  type StoredCustomNode,
} from "./customNodes";

export const NODE_PACK_FORMAT = "n-wave-node-pack";
export const NODE_PACK_FORMAT_VERSION = 1;
export const NODE_PACK_INDEX_FORMAT = "n-wave-node-pack-index";

/** Where a custom node came from, stored on nodes imported from a pack. */
export interface NodePackOrigin {
  id: string;
  name: string;
  version: string;
}

/** nf-core components a node includes, e.g. modules ["salmon/quant"]. */
export interface NodePackNfCoreRefs {
  modules: string[];
  subworkflows: string[];
}

/** A node in a pack: a custom node without its local bookkeeping. */
export interface NodePackNode {
  id: string;
  kind?: "process" | "workflow";
  label: string;
  description: string;
  icon: string;
  processName: string;
  source: string;
  inputs: CustomNodeInput[];
  outputs: CustomNodeOutput[];
  arguments: CustomNodeArgument[];
  config?: string[];
  nfcore?: NodePackNfCoreRefs;
}

export interface NodePack {
  format: typeof NODE_PACK_FORMAT;
  formatVersion: number;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  /** The N-WAVE version that wrote the pack. */
  createdWith?: string;
  nodes: NodePackNode[];
}

/** A custom node as stored, with the pack it was imported from. */
export type PackedCustomNode = StoredCustomNode;

/** Pack ids: lowercase letters, digits, "-", "_" and ".". */
export const PACK_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
/** Node ids: they become file names and process types. */
export const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/;
const PORT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NFCORE_COMPONENT = /^[a-z0-9_]+(\/[a-z0-9_]+)*$/;
const SETTING_TYPES: CustomNodeSettingType[] = [
  "text",
  "integer",
  "float",
  "boolean",
  "select",
  "expression",
];
const MAX_SOURCE_LENGTH = 500_000;
const MAX_NODES = 200;

/** A lowercase id made from a name: "RNA-seq extras" -> "rna-seq-extras". */
export const toPackId = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+|-+$/g, "")
    .slice(0, 80) || "node-pack";

/** The nf-core modules and subworkflows a node's source includes. */
export const getNodeNfCoreRefs = (
  node: Pick<StoredCustomNode, "kind" | "source">,
): NodePackNfCoreRefs => {
  if (node.kind !== "workflow") return { modules: [], subworkflows: [] };
  return getSubworkflowIncludes(node.source);
};

/** Install ids for nf-core components: "nf-core/salmon/quant", "nf-core/subworkflows/x". */
export const nfCoreInstallIds = (refs: NodePackNfCoreRefs): string[] => [
  ...refs.modules.map((module) => `nf-core/${module}`),
  ...refs.subworkflows.map((name) => `nf-core/subworkflows/${name}`),
];

const toPackNode = (node: StoredCustomNode): NodePackNode => {
  const refs = getNodeNfCoreRefs(node);
  return {
    id: node.id,
    ...(node.kind === "workflow" ? { kind: "workflow" as const } : {}),
    label: node.label,
    description: node.description,
    icon: node.icon,
    processName: node.processName,
    source: node.source,
    inputs: node.inputs,
    outputs: node.outputs,
    arguments: node.arguments,
    ...(node.config && node.config.length > 0 ? { config: node.config } : {}),
    ...(refs.modules.length > 0 || refs.subworkflows.length > 0
      ? { nfcore: refs }
      : {}),
  };
};

/** A pack holding the given custom nodes. */
export const buildNodePack = (
  meta: {
    name: string;
    version: string;
    id?: string;
    description?: string;
    author?: string;
    homepage?: string;
    createdWith?: string;
  },
  nodes: StoredCustomNode[],
): NodePack => ({
  format: NODE_PACK_FORMAT,
  formatVersion: NODE_PACK_FORMAT_VERSION,
  id: meta.id?.trim() || toPackId(meta.name),
  name: meta.name.trim(),
  version: meta.version.trim(),
  ...(meta.description?.trim() ? { description: meta.description.trim() } : {}),
  ...(meta.author?.trim() ? { author: meta.author.trim() } : {}),
  ...(meta.homepage?.trim() ? { homepage: meta.homepage.trim() } : {}),
  ...(meta.createdWith ? { createdWith: meta.createdWith } : {}),
  nodes: nodes.map(toPackNode),
});

/** The pack file's contents. */
export const serializeNodePack = (pack: NodePack): string =>
  `${JSON.stringify(pack, null, 2)}\n`;

/** The pack's file name, e.g. "rna-seq-extras-1.0.0.nwave-pack.json". */
export const nodePackFileName = (pack: NodePack): string =>
  `${pack.id}-${pack.version.replace(/[^A-Za-z0-9._-]+/g, "_")}.nwave-pack.json`;

// ---------------------------------------------------------------------------
// Import validation

export interface NodePackNodeResult {
  /** The node's id, or its position when it has none. */
  id: string;
  label: string;
  errors: string[];
  warnings: string[];
  /** The node to store, when it has no errors. */
  node?: PackedCustomNode;
  nfcore: NodePackNfCoreRefs;
}

export interface ParsedNodePack {
  /** Problems with the pack as a whole; nothing is imported when set. */
  errors: string[];
  pack?: Omit<NodePack, "nodes">;
  nodes: NodePackNodeResult[];
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (
  record: JsonRecord,
  key: string,
  errors: string[],
  where: string,
): string | undefined => {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    errors.push(`${where}: "${key}" must be text.`);
    return undefined;
  }
  return value;
};

const requiredString = (
  record: JsonRecord,
  key: string,
  errors: string[],
  where: string,
): string => {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${where}: "${key}" is required.`);
    return "";
  }
  return value;
};

const readInputs = (value: unknown, errors: string[]): CustomNodeInput[] => {
  if (!Array.isArray(value)) {
    errors.push('"inputs" must be a list.');
    return [];
  }
  const inputs: CustomNodeInput[] = [];
  value.forEach((raw, index) => {
    const where = `Input ${index + 1}`;
    if (!isRecord(raw)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    const name = requiredString(raw, "name", errors, where);
    if (name && !PORT_NAME.test(name)) {
      errors.push(`${where}: "${name}" isn't a valid Nextflow name.`);
    }
    const kind = raw.kind;
    if (kind !== "path" && kind !== "val") {
      errors.push(`${where} (${name || "?"}): "kind" must be "path" or "val".`);
    }
    const settingType = raw.settingType;
    if (
      settingType !== undefined &&
      !SETTING_TYPES.includes(settingType as CustomNodeSettingType)
    ) {
      errors.push(
        `${where} (${name}): "settingType" must be one of ${SETTING_TYPES.join(", ")}.`,
      );
    }
    if (
      raw.options !== undefined &&
      !(
        Array.isArray(raw.options) &&
        raw.options.every((option) => typeof option === "string")
      )
    ) {
      errors.push(`${where} (${name}): "options" must be a list of text.`);
    }
    if (raw.collect !== undefined && typeof raw.collect !== "boolean") {
      errors.push(`${where} (${name}): "collect" must be true or false.`);
    }
    for (const key of [
      "label",
      "fileType",
      "filePattern",
      "defaultValue",
      "emptyValue",
    ]) {
      optionalString(raw, key, errors, `${where} (${name})`);
    }
    inputs.push(raw as unknown as CustomNodeInput);
  });
  return inputs;
};

const readOutputs = (value: unknown, errors: string[]): CustomNodeOutput[] => {
  if (!Array.isArray(value)) {
    errors.push('"outputs" must be a list.');
    return [];
  }
  const outputs: CustomNodeOutput[] = [];
  value.forEach((raw, index) => {
    const where = `Output ${index + 1}`;
    if (!isRecord(raw)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    const name = requiredString(raw, "name", errors, where);
    if (name && !PORT_NAME.test(name)) {
      errors.push(`${where}: "${name}" isn't a valid Nextflow name.`);
    }
    if (typeof raw.emit !== "string") {
      errors.push(`${where} (${name}): "emit" is required.`);
    }
    for (const key of ["label", "fileType", "filePattern"]) {
      optionalString(raw, key, errors, `${where} (${name})`);
    }
    outputs.push(raw as unknown as CustomNodeOutput);
  });
  return outputs;
};

const readNfCoreRefs = (
  value: unknown,
  errors: string[],
): NodePackNfCoreRefs => {
  const refs: NodePackNfCoreRefs = { modules: [], subworkflows: [] };
  if (value === undefined) return refs;
  if (!isRecord(value)) {
    errors.push(
      '"nfcore" must be an object with "modules" and "subworkflows".',
    );
    return refs;
  }
  for (const key of ["modules", "subworkflows"] as const) {
    const list = value[key];
    if (list === undefined) continue;
    if (
      !Array.isArray(list) ||
      !list.every(
        (entry) => typeof entry === "string" && NFCORE_COMPONENT.test(entry),
      )
    ) {
      errors.push(
        `"nfcore.${key}" must list nf-core names such as "salmon/quant".`,
      );
      continue;
    }
    refs[key] = list as string[];
  }
  return refs;
};

/** Check one pack node against its source; the stored node when it's valid. */
export const validatePackNode = (
  raw: unknown,
  index: number,
  origin: NodePackOrigin,
): NodePackNodeResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(raw)) {
    return {
      id: `#${index + 1}`,
      label: `Node ${index + 1}`,
      errors: ["The node must be an object."],
      warnings,
      nfcore: { modules: [], subworkflows: [] },
    };
  }
  const where = "Node";
  const id = requiredString(raw, "id", errors, where);
  if (id && !NODE_ID.test(id)) {
    errors.push(
      `"${id}" isn't a valid node id (letters, digits, "_", "-", "."; up to 120 characters).`,
    );
  }
  const label = requiredString(raw, "label", errors, where);
  const source = requiredString(raw, "source", errors, where);
  if (source.length > MAX_SOURCE_LENGTH) {
    errors.push(`The source is longer than ${MAX_SOURCE_LENGTH} characters.`);
  }
  const processName = requiredString(raw, "processName", errors, where);
  const description = optionalString(raw, "description", errors, where) ?? "";
  const icon = optionalString(raw, "icon", errors, where) ?? "Code";
  const kind = raw.kind;
  if (kind !== undefined && kind !== "process" && kind !== "workflow") {
    errors.push('"kind" must be "process" or "workflow".');
  }
  const inputs = readInputs(raw.inputs ?? [], errors);
  const outputs = readOutputs(raw.outputs ?? [], errors);
  if (
    raw.config !== undefined &&
    !(
      Array.isArray(raw.config) &&
      raw.config.every((line) => typeof line === "string")
    )
  ) {
    errors.push('"config" must be a list of text lines.');
  }
  const nfcore = readNfCoreRefs(raw.nfcore, errors);

  // The source must declare what the node says it does.
  if (source && processName) {
    const parsed = parseCustomNodeSource(source);
    const sourceKind = parsed.kind ?? "process";
    const declaredKind = kind === "workflow" ? "workflow" : "process";
    if (!parsed.processName) {
      errors.push("The source declares no process or named workflow.");
    } else if (parsed.processName !== processName) {
      errors.push(
        `The source declares ${sourceKind} ${parsed.processName}, but "processName" is ${processName}.`,
      );
    } else if (sourceKind !== declaredKind) {
      errors.push(
        `The source is a ${sourceKind}, but "kind" is ${declaredKind}.`,
      );
    }
    const sourceInputs = new Set(parsed.inputs.map((input) => input.name));
    const sourceOutputs = new Set(parsed.outputs.map((output) => output.emit));
    if (parsed.processName === processName) {
      for (const input of inputs) {
        if (input.name && !sourceInputs.has(input.name)) {
          errors.push(`Input "${input.name}" isn't declared in the source.`);
        }
      }
      for (const output of outputs) {
        if (output.emit && !sourceOutputs.has(output.emit)) {
          errors.push(
            `Output "${output.name}" emits "${output.emit}", which the source doesn't declare.`,
          );
        }
      }
    }
    warnings.push(...parsed.warnings);
    if (declaredKind === "workflow") {
      const included = getSubworkflowIncludes(source);
      const listed = new Set([...nfcore.modules, ...nfcore.subworkflows]);
      const missing = [...included.modules, ...included.subworkflows].filter(
        (name) => !listed.has(name),
      );
      if (missing.length > 0) {
        warnings.push(
          `The source includes nf-core components the pack doesn't list: ${missing.join(", ")}.`,
        );
        nfcore.modules = Array.from(
          new Set([...nfcore.modules, ...included.modules]),
        ).sort();
        nfcore.subworkflows = Array.from(
          new Set([...nfcore.subworkflows, ...included.subworkflows]),
        ).sort();
      }
    }
  }
  const duplicates = (names: string[]) =>
    names.filter((name, position) => name && names.indexOf(name) !== position);
  for (const name of new Set(duplicates(inputs.map((input) => input.name)))) {
    errors.push(`Input "${name}" is listed twice.`);
  }
  for (const name of new Set(
    duplicates(outputs.map((output) => output.name)),
  )) {
    errors.push(`Output "${name}" is listed twice.`);
  }

  const result: NodePackNodeResult = {
    id: id || `#${index + 1}`,
    label: label || id || `Node ${index + 1}`,
    errors,
    warnings,
    nfcore,
  };
  if (errors.length > 0) return result;

  const parsedArguments = parseCustomNodeSource(source).arguments;
  const now = new Date().toISOString();
  result.node = {
    id,
    ...(kind === "workflow" ? { kind: "workflow" as const } : {}),
    label,
    description,
    icon,
    processType: id,
    processName,
    source,
    inputs,
    outputs,
    arguments: Array.isArray(raw.arguments)
      ? (raw.arguments as CustomNodeArgument[])
      : parsedArguments,
    ...(Array.isArray(raw.config) ? { config: raw.config as string[] } : {}),
    createdAt: now,
    updatedAt: now,
    pack: origin,
  };
  return result;
};

/** Read a pack file's text: pack-level errors, and a result per node. */
export const parseNodePack = (text: string): ParsedNodePack => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {
      errors: [
        `The file isn't valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
      nodes: [],
    };
  }
  if (!isRecord(data)) {
    return { errors: ["A node pack must be a JSON object."], nodes: [] };
  }
  const errors: string[] = [];
  if (data.format !== NODE_PACK_FORMAT) {
    errors.push(
      `This isn't an N-WAVE node pack ("format" must be "${NODE_PACK_FORMAT}").`,
    );
    return { errors, nodes: [] };
  }
  if (typeof data.formatVersion !== "number" || data.formatVersion < 1) {
    errors.push('"formatVersion" must be a number.');
  } else if (data.formatVersion > NODE_PACK_FORMAT_VERSION) {
    errors.push(
      `The pack uses format version ${data.formatVersion}; this N-WAVE reads up to version ${NODE_PACK_FORMAT_VERSION}. Update N-WAVE to import it.`,
    );
  }
  const name = requiredString(data, "name", errors, "Pack");
  const version = requiredString(data, "version", errors, "Pack");
  const id = typeof data.id === "string" ? data.id : toPackId(name);
  if (!PACK_ID.test(id)) {
    errors.push(
      `"${id}" isn't a valid pack id (lowercase letters, digits, "-", "_", ".").`,
    );
  }
  for (const key of ["description", "author", "homepage", "createdWith"]) {
    optionalString(data, key, errors, "Pack");
  }
  if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
    errors.push("The pack has no nodes.");
  } else if (data.nodes.length > MAX_NODES) {
    errors.push(`A pack can hold up to ${MAX_NODES} nodes.`);
  }
  if (errors.length > 0) return { errors, nodes: [] };

  const origin: NodePackOrigin = { id, name, version };
  const nodes = (data.nodes as unknown[]).map((node, index) =>
    validatePackNode(node, index, origin),
  );
  const seen = new Map<string, number>();
  for (const result of nodes) {
    if (!result.node) continue;
    const count = (seen.get(result.node.id) ?? 0) + 1;
    seen.set(result.node.id, count);
    if (count > 1) {
      result.errors.push(`Another node in the pack has the id "${result.id}".`);
      result.node = undefined;
    }
  }
  const { nodes: _nodes, ...pack } = data as unknown as NodePack;
  return {
    errors: [],
    pack: { ...pack, id, name, version },
    nodes,
  };
};

// ---------------------------------------------------------------------------
// Installed packs and conflicts

export interface InstalledNodePack extends NodePackOrigin {
  nodes: PackedCustomNode[];
}

/** Installed custom nodes grouped by the pack they came from. */
export const groupInstalledPacks = (
  nodes: PackedCustomNode[],
): InstalledNodePack[] => {
  const packs = new Map<string, InstalledNodePack>();
  for (const node of nodes) {
    if (!node.pack) continue;
    const pack = packs.get(node.pack.id) ?? { ...node.pack, nodes: [] };
    pack.nodes.push(node);
    packs.set(node.pack.id, pack);
  }
  return Array.from(packs.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
};

export interface NodePackConflict {
  incoming: PackedCustomNode;
  existing: PackedCustomNode;
  /** Same pack (an update), another pack, or a local custom node. */
  existingSource: "same-pack" | "other-pack" | "local";
}

/** Pack nodes whose id is already used by an installed custom node. */
export const findPackConflicts = (
  incoming: PackedCustomNode[],
  installed: PackedCustomNode[],
): NodePackConflict[] => {
  const byId = new Map(installed.map((node) => [node.id, node]));
  return incoming.flatMap((node) => {
    const existing = byId.get(node.id);
    if (!existing) return [];
    return [
      {
        incoming: node,
        existing,
        existingSource: !existing.pack
          ? ("local" as const)
          : existing.pack.id === node.pack?.id
            ? ("same-pack" as const)
            : ("other-pack" as const),
      },
    ];
  });
};

/** A copy of a node under a new id, for keeping both sides of a conflict. */
export const withNewNodeId = (
  node: PackedCustomNode,
  taken: Set<string>,
): PackedCustomNode => {
  let suffix = 2;
  let id = `${node.id}_${suffix}`;
  while (taken.has(id)) {
    suffix += 1;
    id = `${node.id}_${suffix}`;
  }
  return { ...node, id, processType: id };
};

// ---------------------------------------------------------------------------
// Community index

export interface NodePackIndexEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  /** Where the pack file is, absolute or relative to the index. */
  url: string;
}

/** Read a community index: the listed packs with absolute URLs. */
export const parseNodePackIndex = (
  text: string,
  indexUrl: string,
): { entries: NodePackIndexEntry[]; errors: string[] } => {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { entries: [], errors: ["The index isn't valid JSON."] };
  }
  if (!isRecord(data) || data.format !== NODE_PACK_INDEX_FORMAT) {
    return {
      entries: [],
      errors: [
        `This isn't an N-WAVE node pack index ("format" must be "${NODE_PACK_INDEX_FORMAT}").`,
      ],
    };
  }
  if (!Array.isArray(data.packs)) {
    return { entries: [], errors: ['The index has no "packs" list.'] };
  }
  const errors: string[] = [];
  const entries: NodePackIndexEntry[] = [];
  data.packs.forEach((raw, index) => {
    if (
      !isRecord(raw) ||
      typeof raw.name !== "string" ||
      typeof raw.url !== "string" ||
      typeof raw.version !== "string"
    ) {
      errors.push(
        `Index entry ${index + 1} needs "name", "version" and "url".`,
      );
      return;
    }
    let url: string;
    try {
      url = new URL(raw.url, indexUrl).toString();
    } catch {
      errors.push(`Index entry ${index + 1} has an invalid "url".`);
      return;
    }
    entries.push({
      id: typeof raw.id === "string" ? raw.id : toPackId(raw.name),
      name: raw.name,
      version: raw.version,
      url,
      ...(typeof raw.description === "string"
        ? { description: raw.description }
        : {}),
      ...(typeof raw.author === "string" ? { author: raw.author } : {}),
    });
  });
  return { entries, errors };
};

export type ConflictChoice = "replace" | "keep-both" | "skip";

/** The default for a conflict: update a pack's own nodes, keep others. */
export const defaultConflictChoice = (
  conflict: NodePackConflict,
): ConflictChoice =>
  conflict.existingSource === "same-pack" ? "replace" : "keep-both";

/**
 * The nodes to save for an import, after the choice made for each
 * conflicting id (default: defaultConflictChoice).
 */
export const resolvePackImport = (
  incoming: PackedCustomNode[],
  installed: PackedCustomNode[],
  choices: Record<string, ConflictChoice> = {},
): PackedCustomNode[] => {
  const conflicts = new Map(
    findPackConflicts(incoming, installed).map((conflict) => [
      conflict.incoming.id,
      conflict,
    ]),
  );
  const taken = new Set([
    ...installed.map((node) => node.id),
    ...incoming.map((node) => node.id),
  ]);
  return incoming.flatMap((node) => {
    const conflict = conflicts.get(node.id);
    if (!conflict) return [node];
    const choice = choices[node.id] ?? defaultConflictChoice(conflict);
    if (choice === "skip") return [];
    if (choice === "replace") {
      // Keep the existing node's creation date.
      return [{ ...node, createdAt: conflict.existing.createdAt }];
    }
    const renamed = withNewNodeId(node, taken);
    taken.add(renamed.id);
    return [renamed];
  });
};
