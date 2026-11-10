// Turns a Nextflow script into a workflow on the canvas.
//
// Every part of the script becomes something on the canvas:
// - input channels N-WAVE writes (File Input, Samplesheet, reference
//   parameters) become those nodes, with their settings;
// - each process or module call becomes a step: N-WAVE's own Filter, Map,
//   Merge and Display Output (when the code is exactly what N-WAVE would
//   write for some settings), nf-core modules and subworkflows from the
//   catalog, custom nodes from the node library, or a custom process that
//   keeps the script's code (editable, with its inputs and outputs);
// - how steps read each other's outputs becomes the connections, the
//   channel code N-WAVE writes between steps included (it comes back as a
//   plain connection);
// - any other channel code becomes channel operator nodes, with the
//   variable names the script used;
// - params become a Parameters node, notes (`/* Note: … */`) notes;
// - anything else (functions, plugin includes, params set from code, the
//   output block, a workflow's publish: section, ...) is kept as written in
//   a code node that says where in the script it goes.
// Positions come from the `// N-WAVE layout:` line when there is one,
// otherwise the steps are laid out left to right by dependency.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData, PortData } from "../../components/nodes/BaseNode";
import { generateOperatorCode } from "../../generators/core/templateEngine";
import { parseLayoutComment, type LayoutEntry } from "../../generators/core/layoutComment";
import { inlineGroups, withoutGroupSelectors } from "../../groups/inlineGroups";
import type { WorkflowParameter } from "../../registry/params";
import { nodeDefinitions, type NodeDefinition } from "../../registry/nodeDefinitions";
import {
  createNodeDefinitionFromCustomNode,
  createStoredCustomNode,
  EMBEDDED_DATES,
  parseCustomNodeSource,
  type StoredCustomNode,
} from "../../registry/customNodes";
import { createNodeDefinitionFromNfCoreManifest } from "../../registry/nfcoreModuleAdapters";
import { extractRootIncludes } from "../../registry/nfcore/subworkflowSource";
import { stripComments } from "../nested/workflowGraph";
import { buildNfCoreManifest, type NfCoreCatalogEntryForManifest } from "../../registry/nfcore/manifest";
import {
  buildNfCoreSubworkflowManifest,
  createNodeDefinitionFromNfCoreSubworkflowManifest,
  type NfCoreSubworkflowCatalogEntry,
} from "../../registry/nfcore/subworkflow";
import { getGroupItems, type NfCoreModuleInputGroup } from "../../registry/nfcore/inputChannels";
import {
  blockBody,
  definedNames,
  embeddedConfig,
  maskSource,
  readIncludeItem,
  splitWorkflowStatements,
  topLevelItems,
  usedNames,
  workflowSections,
  type Statement,
  type TopLevelItem,
} from "./nextflowSource";
import { autoLayout } from "./autoLayout";
import { createProjectReader, namesCalledIn, readNotes } from "./projectReader";
import type { FileContent } from "../../utils/fileContent";
import { lowerSnake, processNamesFor, uniqueName } from "../../generators/core/naming";
import { CODE_PLACEMENTS, type CodePlacement } from "../../generators/core/placement";

export interface ImportedCanvas {
  /** From the script's first comment line, when it has one. */
  name: string | null;
  nodes: Node<NodeData>[];
  edges: Edge[];
  /** nf-core definitions the nodes use (register them to generate). */
  definitions: NodeDefinition[];
  warnings: string[];
}

interface Source {
  nodeId: string;
  port: string;
}

/** The nf-core catalog (GET /nfcore/catalog), to recognize included modules and subworkflows. */
export interface NfCoreCatalogForImport {
  modules: NfCoreCatalogEntryForManifest[];
  subworkflows?: NfCoreSubworkflowCatalogEntry[];
}

let modules: NfCoreCatalogEntryForManifest[] = [];
let subworkflows: NfCoreSubworkflowCatalogEntry[] = [];

/** Remove the indentation the lines share. */
const dedent = (text: string): string => {
  const lines = text.split("\n");
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const common = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(common)).join("\n");
};

/** A statement's later lines, indented from where its first line started. */
const outdent = (text: string, column: number): string =>
  text
    .split("\n")
    .map((line, index) => (index === 0 ? line : line.replace(new RegExp(`^[ \\t]{0,${column}}`), "")))
    .join("\n");

/** Split call arguments at top-level commas. */
export const splitArguments = (args: string): string[] => {
  const masked = maskSource(args);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(args.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (args.slice(start).trim()) parts.push(args.slice(start).trim());
  return parts;
};

/** `STEP(args)` or `x = STEP(args)` (one call, nothing after it). */
const callOf = (text: string): { name: string; args: string; assigned: string | null } | null => {
  const masked = maskSource(text);
  const match = masked.match(/^(?:([A-Za-z_]\w*)\s*=\s*)?([A-Za-z_]\w*)\s*\(/);
  if (!match) return null;
  const open = match[0].length - 1;
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if ("([{".includes(masked[index])) depth += 1;
    if (")]}".includes(masked[index])) depth -= 1;
    if (depth === 0) {
      if (masked.slice(index + 1).trim() !== "") return null;
      return { name: match[2], args: text.slice(open + 1, index), assigned: match[1] ?? null };
    }
  }
  return null;
};

const quoted = /^'((?:[^'\\]|\\.)*)'$|^"((?:[^"\\$]|\\.)*)"$/;
const unquote = (text: string): string | null => {
  const match = text.trim().match(quoted);
  if (!match) return null;
  return (match[1] ?? match[2]).replace(/\\(.)/g, "$1");
};

/** A list of quoted strings: `['a.txt', 'b.txt']`. */
const stringList = (text: string): string[] | null => {
  const inner = text.trim().match(/^\[([\s\S]*)\]$/)?.[1];
  if (inner === undefined) return null;
  const items = splitArguments(inner);
  const values = items.map(unquote);
  return values.every((value): value is string => value !== null) ? values : null;
};

/** Node ids that sort the way the names were made unique (FILTER before FILTER_2). */
const nodeId = (name: string): string =>
  `n-${name.toLowerCase().replace(/_(\d+)$/, (_match, digits: string) => `_${digits.padStart(4, "0")}`)}`;

/** The settings a config block holds for one step: `withName: 'STEP' { … }`. */
const configBlocks = (config: string): Map<string, string[]> => {
  const blocks = new Map<string, string[]>();
  const masked = maskSource(config);
  for (const match of masked.matchAll(/withName:\s*'([^']+)'\s*\{/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < masked.length; end += 1) {
      if (masked[end] === "{") depth += 1;
      if (masked[end] === "}") depth -= 1;
      if (depth === 0) break;
    }
    // The selector as written (the masked text blanks the quoted name).
    const selector = config.slice(match.index ?? 0).match(/withName:\s*'([^']+)'/)?.[1] ?? "";
    blocks.set(selector, dedent(config.slice(open + 1, end)).trim().split("\n"));
  }
  return blocks;
};

/** Process directives N-WAVE writes for its own steps. */
const resourcesOf = (processText: string) => ({
  containerImage: processText.match(/\n\s*container\s+'([^']+)'/)?.[1] ?? "ubuntu:22.04",
  cpus: Number(processText.match(/\n\s*cpus\s+(\d+)/)?.[1] ?? 1),
  memory: processText.match(/\n\s*memory\s+'([^']+)'/)?.[1] ?? "2.GB",
});

const normalize = (code: string): string => code.replace(/\s+/g, " ").trim();

/** Filter/Map/Merge: the settings for which N-WAVE writes exactly this process, if any. */
const recognizeOperator = (name: string, processText: string): Partial<NodeData> | null => {
  const resources = resourcesOf(processText);
  const base = { processName: name, cpuCount: resources.cpus, memoryAmount: resources.memory, containerImage: resources.containerImage };
  const same = (generated: string) => normalize(generated) === normalize(processText);
  const data = (operatorType: string, settings: Record<string, unknown>): Partial<NodeData> => ({
    operatorType,
    ...settings,
    containerImage: resources.containerImage,
    cpus: resources.cpus,
    memory: resources.memory,
  });
  // The script as the shell sees it (a `"""` block escapes `\`, `$` and `"`).
  const plain = processText.replace(/\\(["$\\])/g, "$1");
  // The text after grep/sed: a shell-quoted word (`'it'\''s'`).
  const shellWord = (text: string): string | null => {
    const match = text.match(/^((?:'[^']*'|\\')+)/);
    if (!match) return null;
    return match[1].replace(/'\\''/g, "'").replace(/^'|'$/g, "");
  };
  if (/_filtered\./.test(processText)) {
    const grep = plain.match(/grep ((?:-v )?(?: ?-E )?)\s*((?:'[^']*'|\\')+)/);
    const candidates: Array<Record<string, unknown>> = [{ filterText: "", filterMode: "contains", filterNegate: false }];
    if (grep) {
      const flags = grep[1];
      const pattern = shellWord(grep[2]) ?? "";
      const negate = /-v/.test(flags);
      if (/-E/.test(flags)) candidates.push({ filterText: pattern, filterMode: "regex", filterNegate: negate });
      candidates.push({ filterText: pattern, filterMode: "contains", filterNegate: negate });
      if (pattern.startsWith("^")) candidates.push({ filterText: pattern.slice(1), filterMode: "startsWith", filterNegate: negate });
      if (pattern.endsWith("$")) candidates.push({ filterText: pattern.slice(0, -1), filterMode: "endsWith", filterNegate: negate });
    }
    for (const candidate of candidates) {
      if (same(generateOperatorCode("filter", { ...base, ...candidate } as never))) return data("filter", candidate);
    }
    return null;
  }
  if (/_mapped\./.test(processText)) {
    const sed = plain.match(/sed ((?:'[^']*'|\\')+)/);
    const candidates: Array<Record<string, unknown>> = [
      { mapOperation: "changeCase", mapChangeCase: "toUpperCase" },
      { mapOperation: "changeCase", mapChangeCase: "toLowerCase" },
      { mapOperation: "replaceText", mapReplaceFind: "", mapReplaceWith: "" },
    ];
    const expression = sed ? shellWord(sed[1]) : null;
    const parts = expression?.match(/^s\/((?:[^/\\]|\\.)*)\/((?:[^/\\]|\\.)*)\/g$/);
    if (parts) {
      candidates.push({
        mapOperation: "replaceText",
        mapReplaceFind: parts[1].replace(/\\([\\/])/g, "$1"),
        mapReplaceWith: parts[2].replace(/\\([\\/&])/g, "$1"),
      });
    }
    for (const candidate of candidates) {
      if (same(generateOperatorCode("map", { ...base, ...candidate } as never))) {
        return data("map", { mapChangeCase: "toUpperCase", mapReplaceFind: "", mapReplaceWith: "", ...candidate });
      }
    }
    return null;
  }
  const merged = processText.match(/path "merged\.([A-Za-z0-9]+)", emit: merged/);
  if (merged) {
    const candidate = { mergeOperation: "join", joinType: merged[1] };
    if (same(generateOperatorCode("merge", { ...base, ...candidate } as never))) {
      return data("merge", { ...candidate, mergeJoinSeparator: "\\n" });
    }
  }
  return null;
};

/** N-WAVE's Display Output process (its manifest of saved files). */
const recognizeDisplay = (processText: string): Partial<NodeData> | null => {
  if (!/Output Manifest:/.test(processText) || !/publishDir params\.outdir/.test(processText)) return null;
  const resources = resourcesOf(processText);
  return {
    selectedFileName: /\$input_files/.test(processText) ? "all" : "all",
    downloadFormat: "txt",
    containerImage: resources.containerImage,
    cpus: resources.cpus,
    memory: resources.memory,
  };
};

const definitionDefaults = (id: string): Partial<NodeData> => {
  const definition = nodeDefinitions.find((candidate) => candidate.id === id);
  return JSON.parse(JSON.stringify(definition?.defaults ?? {}));
};

/** A custom node from the node library whose code this process is (renamed), if any. */
const libraryNodeFor = (name: string, processText: string): StoredCustomNode | null => {
  for (const definition of nodeDefinitions) {
    const stored = definition.defaults?.customNodeDefinition as StoredCustomNode | undefined;
    if (!stored || stored.kind === "workflow") continue;
    const renamed = stored.source.replace(
      new RegExp(`(\\bprocess\\s+)${stored.processName}\\b`),
      `$1${name}`,
    );
    if (normalize(renamed) === normalize(processText)) return stored;
  }
  return null;
};

/** Code without comments and whitespace differences, for comparing. */
const comparable = (code: string): string => normalize(stripComments(code));

/** A workflow from the node library whose code this named workflow is, if any. */
const libraryWorkflowFor = (name: string, workflowText: string): StoredCustomNode | null => {
  for (const definition of nodeDefinitions) {
    const stored = definition.defaults?.customNodeDefinition as StoredCustomNode | undefined;
    if (stored?.kind !== "workflow") continue;
    const body = extractRootIncludes(stored.source).source.replace(
      new RegExp(`(\\bworkflow\\s+)${stored.processName}\\b`),
      `$1${name}`,
    );
    if (comparable(body) === comparable(workflowText)) return stored;
  }
  return null;
};

/** The step a script's own process becomes: one of N-WAVE's, a library node or a custom process. */
/** A local workflow's takes as the call passes them: channels are ports, anything else a value written as given. */
const takesByCall = (parsed: ReturnType<typeof parseCustomNodeSource>, channels: Set<number>) => ({
  ...parsed,
  arguments: parsed.arguments.map((argument, index) => {
    const kind = channels.has(index) ? ("path" as const) : ("val" as const);
    return { ...argument, kind, fields: argument.fields.map((field) => ({ ...field, kind })) };
  }),
  inputs: parsed.inputs.map((input, index) =>
    channels.has(index)
      ? { name: input.name, kind: "path" as const, label: input.label }
      : { name: input.name, kind: "val" as const, label: input.label, settingType: input.settingType ?? ("text" as const), defaultValue: input.defaultValue ?? "" },
  ),
});

/** N-WAVE's samplesheet channel (rows to `[meta, reads]`), not any CSV read by hand. */
const isNwaveSamplesheet = (text: string): boolean =>
  /\.collect \{ path -> nwaveInputFile\(path\) \}/.test(text) && /tuple\(meta, reads\)/.test(text);

const stepForProcess = (
  name: string,
  processText: string,
  /** Positions of `val` inputs the call feeds a channel: ports, not settings. */
  channelArguments: Set<number> = new Set(),
  /** Positions of tuple inputs given a whole channel: one port, not one per file. */
  wholeTuples: Set<number> = new Set(),
): { type: string; data: Partial<NodeData>; ports?: { inputs: PortData[]; outputs: PortData[] } } => {
  const operator = recognizeOperator(name, processText);
  if (operator) {
    const id = String(operator.operatorType);
    return { type: "operator", data: { ...definitionDefaults(id), ...operator } };
  }
  const display = recognizeDisplay(processText);
  if (display) return { type: "outputDisplay", data: { ...definitionDefaults("outputDisplay"), ...display } };
  const library = libraryNodeFor(name, processText);
  if (library) {
    return { type: "process", data: JSON.parse(JSON.stringify(createNodeDefinitionFromCustomNode(library).defaults)) };
  }
  // A process only this workflow has: it keeps the script's code.
  const parsed = channelInputs(parseCustomNodeSource(processText), channelArguments, wholeTuples);
  const stored = createStoredCustomNode(
    { label: name, description: "Imported from a Nextflow script.", icon: "Code", source: processText },
    parsed,
    { inputs: parsed.inputs, outputs: parsed.outputs },
  );
  const local: StoredCustomNode = { ...stored, id: `local-${name.toLowerCase()}`, processType: `local_${name.toLowerCase()}`, ...EMBEDDED_DATES };
  return { type: "process", data: JSON.parse(JSON.stringify(createNodeDefinitionFromCustomNode(local).defaults)) };
};

/** `val` inputs that receive channels in the script become ports (they take a channel like any other). */
const channelInputs = (
  parsed: ReturnType<typeof parseCustomNodeSource>,
  positions: Set<number>,
  /** Positions of tuple inputs the call gives a whole channel of tuples. */
  wholeTuples: Set<number> = new Set(),
) => {
  if (positions.size === 0) return parsed;
  const names = new Set(
    parsed.arguments
      .filter((argument, index) => positions.has(index) && (argument.kind === "val" || (argument.kind === "tuple" && wholeTuples.has(index))))
      .map((argument) => argument.name),
  );
  return {
    ...parsed,
    arguments: parsed.arguments.map((argument) =>
      names.has(argument.name)
        ? { ...argument, kind: "path" as const, fields: argument.fields.map((field) => ({ ...field, kind: "path" as const })) }
        : argument,
    ),
    inputs: parsed.inputs.map((input) =>
      names.has(input.name)
        ? { name: input.name, kind: "path" as const, label: input.label }
        : input,
    ),
  };
};

/** The catalog definition of an nf-core module or subworkflow, by the path a script includes it from. */
const nfCoreDefinitionFor = (path: string): NodeDefinition | null => {
  // `…/fastqc/main`, `…/fastqc/main.nf` and `…/fastqc` are the same.
  const module = path.match(/(?:^|\/)modules\/nf-core\/(.+?)(?:\/main(?:\.nf)?)?$/)?.[1];
  if (module) {
    const entry = modules.find((candidate) => candidate.modulePath === module);
    return entry ? createNodeDefinitionFromNfCoreManifest(buildNfCoreManifest(entry)) : null;
  }
  const subworkflow = path.match(/(?:^|\/)subworkflows\/nf-core\/(.+?)(?:\/main(?:\.nf)?)?$/)?.[1];
  if (subworkflow) {
    const entry = subworkflows.find((candidate) => candidate.id === `nf-core/subworkflows/${subworkflow}`);
    return entry ? createNodeDefinitionFromNfCoreSubworkflowManifest(buildNfCoreSubworkflowManifest(entry)) : null;
  }
  return null;
};

/** A Groovy value literal as a setting: 'text' → text, true → true. */
const settingValue = (literal: string): string | number | boolean => {
  const text = literal.trim();
  if (text === "true" || text === "false") return text === "true";
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  const string = unquote(text);
  if (string !== null) return string;
  // "--x ${params.y}": the GString as written.
  const gstring = text.match(/^"([\s\S]*)"$/)?.[1];
  if (gstring !== undefined) return gstring.replace(/\\([\\"$])/g, "$1");
  return text;
};

/** A param value a Parameters node can hold: a number, a boolean or a plain string. */
const isLiteral = (value: string): boolean => {
  const text = value.trim();
  return /^(true|false|-?\d+(\.\d+)?)$/.test(text) || (unquote(text) !== null && !(text.startsWith('"') && text.includes("$")));
};

/** Comments N-WAVE writes itself (header, layout, config, notes): not kept as code. */
const isNwaveComment = (comment: string): boolean =>
  /^\/\/ (Written by N-WAVE|N-WAVE layout:)/.test(comment) || /^\/\* (N-WAVE_NEXTFLOW_CONFIG|Note:)/.test(comment);

/** An nf-core include's path to its main.nf, as the project export reads it (`…/fastqc/main`). */
const nfCoreMain = (path: string): string => path.replace(/\.nf$/, "").replace(/(?<!\/main)$/, "/main");

const isNfCorePath = (path: string): boolean => /\b(modules|subworkflows)\/nf-core\//.test(path);

/**
 * The channels an argument reads once N-WAVE's own adapting code is taken
 * off (`.first()`, `.collect()`, a meta map named after the file, …), or
 * null when it does more than that.
 */
const GLUE_SUFFIXES: RegExp[] = [
  /\.first\(\)$/,
  /\.collect\(\)$/,
  /\.flatten\(\)$/,
  /\.flatten\(\)\.filter \{ item -> item instanceof Path \}$/,
  /\.map \{ (\w+) -> \[ \[id: \1\.simpleName(?:, single_end: true)?\], \1 \] \}$/,
  /\.map \{ meta, (\w+) -> \1 \}$/,
  /\.map \{ item -> item instanceof List && item\.size\(\) > 1 && item\[0\] instanceof Map \? (?:\(item\.size\(\) == 2 \? item\[1\] : item\[1\.\.-1\]\)|item\[1\.\.-1\]) : item \}$/,
  // A subworkflow take's [meta, files] padded to its size.
  /\.map \{ item -> item instanceof List && item\.size\(\) < (\d+) \? item\.collect \{ element -> element \} \+ \(\[\[\]\] \* \(\1 - item\.size\(\)\)\) : item \}$/,
];

const stripGlue = (expression: string): string => {
  let text = expression.trim();
  for (let changed = true; changed; ) {
    changed = false;
    for (const suffix of GLUE_SUFFIXES) {
      const next = text.replace(suffix, "").trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }
  return text;
};

/** `a.concat(b).concat(c)`, `a.mix(b, c)`: the parts; one part when there's nothing to split. */
const splitMix = (expression: string): string[] => {
  const masked = maskSource(expression);
  const match = masked.match(/^([\s\S]*?)\.(concat|mix)\(/);
  if (!match) return [expression.trim()];
  const head = expression.slice(0, match[1].length).trim();
  const open = match[0].length - 1;
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if ("([{".includes(masked[index])) depth += 1;
    if (")]}".includes(masked[index])) depth -= 1;
    if (depth === 0) {
      const args = splitArguments(expression.slice(open + 1, index));
      const rest = expression.slice(index + 1).trim();
      const tail = rest ? splitMix(`${args.pop()}${rest}`) : [];
      return [...splitMix(head), ...args.flatMap(splitMix), ...tail];
    }
  }
  return [expression.trim()];
};

/** Cut a trailing `.name { … }` call off an expression, when it ends with one that matches `head`. */
const cutTrailingClosure = (expression: string, head: RegExp): string | null => {
  const masked = maskSource(expression);
  const trimmed = masked.trimEnd();
  if (!trimmed.endsWith("}")) return null;
  // Find the brace that opens the last closure.
  let depth = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    if (trimmed[index] === "}" || trimmed[index] === ")" || trimmed[index] === "]") depth += 1;
    if (trimmed[index] === "{" || trimmed[index] === "(" || trimmed[index] === "[") {
      depth -= 1;
      if (depth === 0) {
        const before = expression.slice(0, index);
        const call = before.match(/\.\s*(\w+)\s*$/);
        if (!call) return null;
        if (!head.test(`${call[1]} ${expression.slice(index + 1, index + 40)}`)) return null;
        return before.slice(0, before.length - call[0].length).trimEnd();
      }
    }
  }
  return null;
};

/**
 * N-WAVE's general adapting code for nf-core inputs: the channels it reads,
 * in order, or null when the expression isn't that code. It combines
 * several channels (`A.map { item -> [item] }.combine(B …)`), checks they're
 * of one sample and builds the module's tuple (`.map { in0, in1 -> … tuple(…) }`).
 */
const tupleGlueParts = (expression: string): string[] | null => {
  let text = expression.trim().replace(/\.first\(\)$/, "");
  const withoutTuple = cutTrailingClosure(text, /^map\s+(in0|item0)\b/);
  if (withoutTuple === null || !/tuple\(/.test(text)) return null;
  text = withoutTuple;
  text = cutTrailingClosure(text, /^filter\s+(in0|item0)\b/) ?? text;
  const masked = maskSource(text);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if ("([{".includes(char)) depth += 1;
    if (")]}".includes(char)) depth -= 1;
    if (depth === 0 && masked.startsWith(".combine(", index)) {
      parts.push(text.slice(start, index));
      start = index + ".combine(".length;
      depth = 1;
      // The argument ends at the matching parenthesis.
      let inner = 1;
      let end = start;
      for (; end < masked.length && inner > 0; end += 1) {
        if ("([{".includes(masked[end])) inner += 1;
        if (")]}".includes(masked[end])) inner -= 1;
      }
      parts.push(text.slice(start, end - 1));
      start = end;
      index = end - 1;
      depth = 0;
    }
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => stripGlue(part.replace(/\.map \{ item -> \[item\] \}$/, "")));
};

export interface ImportOptions {
  catalog?: NfCoreCatalogForImport | null;
  /**
   * The project's other files by path (`modules/local/fastqc.nf`), so local
   * includes can be read; `path` is the script's own path among them.
   */
  files?: Record<string, string>;
  path?: string;
  /** The project's nextflow.config: step settings (ext.args, …) and params. */
  config?: string;
  /** The project's input files (its inputs/ folder) by name: File Input and Samplesheet nodes get them back. */
  inputs?: Record<string, FileContent>;
}

export const importNextflowScript = (original: string, options: ImportOptions = {}): ImportedCanvas => {
  // Groups N-WAVE wrote (#221): their steps back in the workflow, as nodes of their own.
  const { source, groups: groupOfStep } = inlineGroups(original, { files: options.files, path: options.path });
  modules = options.catalog?.modules ?? [];
  subworkflows = options.catalog?.subworkflows ?? [];
  const warnings: string[] = [];
  const items = topLevelItems(source);
  const layout = parseLayoutComment(source);
  const config = withoutGroupSelectors(
    [embeddedConfig(source), options.config ?? ""].filter(Boolean).join("\n"),
    new Set(groupOfStep.values()),
  );
  const settingsFor = configBlocks(config);
  const headerName = source.match(/^\s*\/\/\s*(.+)\n\/\/ Written by N-WAVE/)?.[1]?.trim() ?? null;

  const { files, inputs, scriptPath, inputFilesFor, rootPath, readLocalInclude, functionsCalled } = createProjectReader(options);
  /** Which file each included named workflow comes from. */
  const workflowFiles = new Map<string, string>();
  const params = new Map<string, string>();
  const includes = new Map<string, { name: string; path: string }>();
  const processes = new Map<string, string>();
  const namedWorkflows = new Map<string, TopLevelItem>();
  let entry: TopLevelItem | null = null;
  const notes = readNotes(source);
  /** Code kept as written, with where it goes and where it was. */
  const kept: Array<{ placement: CodePlacement; start: number; text: string }> = [];
  const paramItems = new Map<string, TopLevelItem>();
  // Comments above code that is left out (a shebang, `nextflow.enable.dsl`) move to the next kept code.
  let carried: string[] = [];
  const keep = (item: TopLevelItem, text = item.text, placement: CodePlacement = entry ? "end" : "script") => {
    const comments = [...carried, ...item.comments].filter((comment) => !isNwaveComment(comment));
    carried = [];
    kept.push({ placement, start: item.start, text: [...comments, text].join("\n") });
  };
  for (const item of items) {
    if (item.kind === "params") {
      params.set(item.name, item.text.replace(/^params\.[\w.]+\s*=\s*/, "").trim());
      paramItems.set(item.name, item);
    } else if (item.kind === "include") {
      const unread: Array<{ name: string; alias: string }> = [];
      const included = readIncludeItem(item.text);
      for (const include of included) {
        // nf-core modules and subworkflows the catalog knows are nf-core nodes, even with their files in the project.
        if (isNfCorePath(include.path) && nfCoreDefinitionFor(rootPath(scriptPath, include.path))) {
          includes.set(include.alias, { name: include.name, path: nfCoreMain(rootPath(scriptPath, include.path)) });
          continue;
        }
        const local = readLocalInclude(scriptPath, include.path, include.name);
        if (local?.kind === "process") processes.set(include.alias, local.text);
        else if (local?.kind === "function") kept.push({ placement: "script", start: item.start, text: local.text });
        else if (local?.kind === "workflow") {
          namedWorkflows.set(include.alias, local.item);
          workflowFiles.set(include.alias, local.file);
        } else if (isNfCorePath(include.path)) includes.set(include.alias, { name: include.name, path: nfCoreMain(rootPath(scriptPath, include.path)) });
        else unread.push(include);
      }
      // Plugins and files that weren't imported with the script: the include stays, calls stay code.
      if (unread.length > 0) {
        const path = included[0].path;
        const names = unread.map((include) => (include.alias === include.name ? include.name : `${include.name} as ${include.alias}`));
        keep(item, unread.length === included.length ? item.text : `include { ${names.join("; ")} } from '${path}'`, "script");
        if (!path.startsWith("plugin/")) {
          warnings.push(`${names.join(", ")} ${unread.length === 1 ? "is" : "are"} included from ${path}, which wasn't imported with the script; ${unread.length === 1 ? "its call stays" : "their calls stay"} as code.`);
        }
      }
    } else if (item.kind === "process") processes.set(item.name, item.text);
    else if (item.kind === "workflow") {
      if (item.name) namedWorkflows.set(item.name, item);
      else entry = item;
    } else if (item.kind === "config") {
      // N-WAVE's settings comment: read as settings.
    } else if (/^#!/.test(item.text) || /^nextflow\.enable\.dsl\b/.test(item.text)) {
      carried.push(...item.comments);
    } else if (item.kind === "function" && /^nwave[A-Z]/.test(item.name)) {
      // N-WAVE's helper functions: the export writes them when the code calls them.
    } else keep(item, item.text, item.kind === "output" ? "end" : undefined);
  }
  if (!entry && namedWorkflows.size > 0) {
    warnings.push("The script has no entry workflow (`workflow { … }`), so it has no steps to connect: it may be a module or subworkflow file meant to be included.");
  }

  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];
  const definitions: NodeDefinition[] = [];
  /** Channel variables and the node port each comes from. */
  const sources = new Map<string, Source>();
  /** Steps by the name the script calls them. */
  const steps = new Map<string, Node<NodeData>>();
  const usedParams = new Set(["outdir", "inputdir"]);

  const keys = new Map<string, string>();
  const addNode = (key: string, type: string, data: Partial<NodeData>, label: string): Node<NodeData> => {
    const placed = layout.get(key);
    const node: Node<NodeData> = {
      id: nodeId(key),
      type,
      position: placed ? { x: placed.x, y: placed.y } : { x: 0, y: 0 },
      data: { ...data, label: placed?.label ?? label } as NodeData,
    };
    nodes.push(node);
    keys.set(node.id, key);
    return node;
  };

  const connect = (from: Source, to: Node<NodeData>, targetHandle: string, order: number) => {
    edges.push({
      id: `e-${from.nodeId}.${from.port}-${to.id}.${targetHandle}-${edges.length}`,
      source: from.nodeId,
      sourceHandle: from.port,
      target: to.id,
      targetHandle,
      ...(order > 0 ? { data: { order } } : {}),
    });
  };

  const sections = entry ? workflowSections(blockBody(entry.text)) : null;
  const statements: Statement[] = sections ? splitWorkflowStatements(sections.main) : [];
  for (const placement of ["publish", "onComplete", "onError"] as const) {
    const code = dedent(sections?.[placement] ?? "").trim();
    if (code) kept.push({ placement, start: entry?.start ?? 0, text: code });
  }

  // Which variables later statements read, and how (as a whole call argument or otherwise).
  const knownVariables = new Set(statements.flatMap((statement) => definedNames(statement.text)));
  const readsOf = statements.map((statement) => usedNames(statement.text, knownVariables));
  // What the workflow's other sections read (publish:, ...): channels the main code must keep.
  const sectionReads = usedNames(
    kept.filter((code) => code.placement !== "script").map((code) => code.text).join("\n"),
    knownVariables,
  );

  // Processes and includes that only named workflows call belong to those workflows.
  const mainText = entry ? blockBody(entry.text) : "";
  const calledIn = namesCalledIn;
  const calledInMain = calledIn(mainText);
  const ownedByWorkflows = new Set<string>();
  const workflowCalls = new Map<string, Set<string>>();
  for (const [name, item] of namedWorkflows) {
    const calls = calledIn(blockBody(item.text));
    workflowCalls.set(name, calls);
    for (const called of calls) if (!calledInMain.has(called)) ownedByWorkflows.add(called);
  }
  /**
   * A workflow from one of the project's files, with what it uses from its
   * file's includes: local processes and workflows written in, nf-core
   * includes with paths from the project root.
   */
  const fileWorkflowSource = (file: string, item: TopLevelItem, seen = new Set<string>()): string => {
    const calls = calledIn(blockBody(item.text));
    const parts: string[] = [];
    const items = topLevelItems(files[file] ?? "");
    for (const other of items) {
      if (other.kind === "include") {
        for (const include of readIncludeItem(other.text)) {
          if (!calls.has(include.alias)) continue;
          const local = readLocalInclude(file, include.path, include.name);
          if (local?.kind === "process") parts.push(include.alias === include.name ? local.text : local.text.replace(/^process\s+\w+/, `process ${include.alias}`));
          else if (local?.kind === "function") parts.push(local.text);
          else if (local?.kind === "workflow" && !seen.has(local.file + local.item.name)) {
            seen.add(local.file + local.item.name);
            parts.push(fileWorkflowSource(local.file, local.item, seen));
          } else if (!local) {
            parts.unshift(`include { ${include.name}${include.alias === include.name ? "" : ` as ${include.alias}`} } from '${rootPath(file, include.path)}'`);
          }
        }
      } else if (other.kind === "process" && calls.has(other.name)) parts.push(other.text);
      else if (other.kind === "workflow" && other.name && other !== item && calls.has(other.name) && !seen.has(file + other.name)) {
        seen.add(file + other.name);
        parts.push(fileWorkflowSource(file, other, seen));
      }
    }
    // Functions the workflow calls (and those they call), from its file.
    parts.push(...functionsCalled(file, calls));
    return [...parts, [...item.comments, item.text].join("\n")].join("\n\n");
  };

  const localWorkflowSource = (name: string): string => {
    const item = namedWorkflows.get(name) as TopLevelItem;
    const file = workflowFiles.get(name);
    if (file) {
      const source = fileWorkflowSource(file, item);
      // Included under another name: the workflow is called that.
      return item.name === name ? source : source.replace(new RegExp(`(\\bworkflow\\s+)${item.name}\\b`), `$1${name}`);
    }
    const calls = workflowCalls.get(name) ?? new Set<string>();
    const usedIncludes = [...includes.entries()]
      .filter(([alias]) => calls.has(alias))
      .map(([alias, include]) => `include { ${include.name}${alias === include.name ? "" : ` as ${alias}`} } from '${include.path}'`);
    const usedProcesses = [...processes.entries()].filter(([process]) => calls.has(process)).map(([, text]) => text);
    // Workflows it calls (from other files or this one), with what they need.
    const usedWorkflows = [...namedWorkflows.keys()].filter((other) => other !== name && calls.has(other)).map(localWorkflowSource);
    return [usedIncludes.join("\n"), ...usedProcesses, ...usedWorkflows, [...item.comments, item.text].join("\n")].filter(Boolean).join("\n\n");
  };

  /** The node port a reference (`ch_x`, `STEP.out.reads`) reads, if known. */
  const resolveReference = (reference: string): Source | null => {
    const text = reference.trim();
    if (sources.has(text)) return sources.get(text) ?? null;
    const output = text.match(/^([A-Za-z_]\w*)\.out(?:\.([A-Za-z_]\w*)|\[(\d+)\])?$/);
    if (!output) return null;
    const step = steps.get(output[1]);
    if (!step) return null;
    const ports = step.data.outputs ?? [];
    const port = output[2]
      ? (ports.find((candidate) => candidate.name === output[2]) ??
        ports.find((candidate) => {
          const stored = step.data.customNodeDefinition as StoredCustomNode | undefined;
          return stored?.outputs.find((out) => out.name === candidate.name)?.emit === output[2];
        }))
      : ports[output[3] ? Number(output[3]) : 0];
    return port ? { nodeId: step.id, port: port.name } : null;
  };

  /** Variables only defined to adapt a channel to the step reading them (N-WAVE writes these). */
  const glue = new Map<string, string>();
  /** Filter's selected files: `ch_x = <files>.filter { file -> file.name == '…' }`. */
  const selectedFiles = new Map<string, string>();
  /** Reference file params and the channel each is read into. */
  const fileParams = new Map<string, string>();

  /** The node ports an argument reads; null when it does more than adapt them. */
  const resolveArgument = (argument: string): Source[] | null => {
    const text = argument.trim();
    if (glue.has(text)) return resolveArgument(glue.get(text) as string);
    const tuple = tupleGlueParts(text);
    if (tuple) {
      const resolved = tuple.flatMap((part) => splitMix(part).map((piece) => resolveReference(stripGlue(piece))));
      return resolved.every((entry): entry is Source => entry !== null) ? resolved : null;
    }
    const parts = splitMix(stripGlue(text)).map((part) => resolveReference(stripGlue(part)));
    return parts.every((entry): entry is Source => entry !== null) ? parts : null;
  };

  // Channel operator nodes, one per group of statements.
  const outputlessKeys = new Set<string>();
  let unlabeled = 0;
  const operatorFor = (group: Statement[], label: string | null, later: Array<{ variables: string[] }>) => {
    const defines = new Set(group.flatMap((statement) => definedNames(statement.text)));
    const readLater = new Set(later.flatMap((reads) => reads.variables));
    const inputs = new Map<string, Source>();
    const inputName = (reference: string) => {
      const name = reference.replace(/\.out\.?/, "_").replace(/\W+/g, "_").replace(/_+$/, "").toLowerCase();
      return name || "in";
    };
    let code = group
      .map((statement) => [...statement.comments.slice(label && statement === group[0] ? 1 : 0), outdent(statement.text, statement.column)].join("\n"))
      .join("\n");
    // Inputs: channels from outside the group; outputs: what later code reads.
    // Names inside `"${x}"` are code too.
    const masked = () => maskSource(code, { keepInterpolations: true });
    const replaceAll = (pattern: RegExp, replace: (match: RegExpExecArray) => string | null) => {
      const current = masked();
      const pieces: Array<[number, number, string]> = [];
      for (const match of current.matchAll(pattern)) {
        const replacement = replace(match as RegExpExecArray);
        if (replacement !== null) pieces.push([match.index ?? 0, (match.index ?? 0) + match[0].length, replacement]);
      }
      for (const [start, end, replacement] of pieces.reverse()) code = code.slice(0, start) + replacement + code.slice(end);
    };
    replaceAll(/(?<![.\w])([A-Za-z_]\w*)\.out(?:\.([A-Za-z_]\w*)|(\[\d+\]))?(?!\w)/g, (match) => {
      // STEP.out.reads, or STEP.out followed by an operator (`.view()`).
      const full = resolveReference(match[0]);
      const reference = full ?? resolveReference(`${match[1]}.out`);
      if (!reference) return null;
      const name = inputName(full ? match[0] : `${match[1]}.out`);
      inputs.set(name, reference);
      return full ? `input.${name}` : `input.${name}${match[2] ? `.${match[2]}` : (match[3] ?? "")}`;
    });
    // Outputs: what later code reads, and channels named like N-WAVE's (`ch_…`).
    const isOutput = (name: string) => readLater.has(name) || name.startsWith("ch_");
    replaceAll(/(?<![.\w])([A-Za-z_]\w*)(?![\w(])/g, (match) => {
      const name = match[1];
      if (defines.has(name)) return isOutput(name) ? `output.${name}` : `local.${name}`;
      const reference = sources.get(name);
      if (!reference) return null;
      inputs.set(name, reference);
      return `input.${name}`;
    });
    const outputs = [...defines].filter(isOutput);
    // Named like the export names it in the layout line: its first output, else its label.
    if (outputs.length === 0 && label === null) unlabeled += 1;
    const key = outputs[0] ?? uniqueName(lowerSnake(label ?? `ch_channels_${unlabeled}`) || "channels", outputlessKeys);
    const node = addNode(
      key,
      "channelOperator",
      {
        subtitle: "Channel code",
        channelOperatorTemplate: "custom",
        channelOperatorCode: code,
        inputs: [...inputs.keys()].map((name) => ({ name, label: name, isConnectable: true })),
        outputs: outputs.map((name) => ({ name, label: name, isConnectable: true })),
        channelNames: Object.fromEntries(outputs.map((name) => [name, name])),
      },
      label ?? key,
    );
    for (const [name, reference] of inputs) connect(reference, node, name, 0);
    for (const name of outputs) sources.set(name, { nodeId: node.id, port: name });
  };

  /**
   * A step argument that is channel code (`channel.fromPath('*.txt')`,
   * `ch.map { … }`): a channel operator that feeds the step.
   */
  const argumentOperator = (stepName: string, port: string, argument: string): Source[] | null => {
    const literal = settingValue(argument);
    if (typeof literal !== "string" || unquote(argument) !== null || /^\[[\s[\]:,]*\]$/.test(argument.trim())) return null;
    const variable = `ch_${stepName.toLowerCase()}_${port}`.replace(/\W+/g, "_");
    const before = nodes.length;
    operatorFor([{ text: `${variable} = ${argument.trim()}`, comments: [], column: 0 }], null, [{ variables: [variable] }]);
    if (nodes.length === before) return null;
    return [sources.get(variable) as Source];
  };

  /** Whether an argument is a channel (a channel variable, a step's output, channel code). */
  const readsChannel = (argument: string): boolean => {
    if (resolveArgument(argument)) return true;
    if (/(?<![.\w])[Cc]hannel\./.test(maskSource(argument))) return true;
    const reads = usedNames(argument, new Set([...sources.keys(), ...glue.keys()]));
    return reads.variables.length > 0 || reads.outputs.some((output) => steps.has(output.step));
  };

  // The values params are declared with, as settings.
  const paramValue = (name: string): string | undefined => params.get(name);

  const step = (name: string, args: string[], statementText: string): boolean => {
    const local = processes.get(name);
    const include = includes.get(name);
    const named = namedWorkflows.get(name);
    let node: Node<NodeData>;
    if (named) {
      const library = libraryWorkflowFor(name, named.text);
      if (library) {
        node = addNode(name, "process", JSON.parse(JSON.stringify(createNodeDefinitionFromCustomNode(library).defaults)), name);
      } else {
        // A workflow only this script has: its code, with the processes and includes only it uses.
        const source = localWorkflowSource(name);
        const channels = new Set(args.flatMap((argument, index) => (readsChannel(argument) ? [index] : [])));
        const parsed = takesByCall(parseCustomNodeSource(source), channels);
        const stored = createStoredCustomNode(
          { label: name, description: "Imported from a Nextflow script.", icon: "Workflow", source },
          parsed,
          { inputs: parsed.inputs, outputs: parsed.outputs },
        );
        const workflow: StoredCustomNode = { ...stored, id: `local-${name.toLowerCase()}`, processType: `local_${name.toLowerCase()}`, ...EMBEDDED_DATES };
        node = addNode(name, "process", JSON.parse(JSON.stringify(createNodeDefinitionFromCustomNode(workflow).defaults)), name);
      }
    } else if (local) {
      const channels = new Set(args.flatMap((argument, index) => (readsChannel(argument) ? [index] : [])));
      // N-WAVE builds a tuple from its files (glue code); hand-written code passes the tuples.
      const isTupleGlue = (argument: string) => tupleGlueParts(glue.get(argument.trim()) ?? argument) !== null;
      const wholeTuples = new Set([...channels].filter((index) => !isTupleGlue(args[index])));
      const made = stepForProcess(name, local, channels, wholeTuples);
      node = addNode(name, made.type, made.data, name);
    } else if (include) {
      const definition = nfCoreDefinitionFor(include.path);
      if (!definition) {
        // Not in the catalog: the include stays, and the call stays code.
        warnings.push(`${name} is included from ${include.path}, which isn't in N-WAVE's nf-core catalog; its call stays as code.`);
        kept.push({
          placement: "script",
          start: 0,
          text: `include { ${include.name === name ? name : `${include.name} as ${name}`} } from '${include.path}'`,
        });
        includes.delete(name);
        return false;
      }
      if (!definitions.some((known) => known.id === definition.id)) definitions.push(definition);
      const data: Partial<NodeData> = JSON.parse(JSON.stringify(definition.defaults ?? {}));
      node = addNode(name, definition.type, data, name);
      applyNfCoreConfig(node, name, settingsFor);
    } else {
      return false;
    }
    steps.set(name, node);
    if (!wireStep(node, args, name)) {
      warnings.push(`The inputs of ${name} couldn't all be read: \`${statementText.replace(/\s+/g, " ").slice(0, 120)}\`.`);
    }
    return true;
  };

  /** Connect a step's arguments to its ports; settings from literal arguments. */
  const wireStep = (node: Node<NodeData>, args: string[], stepName: string): boolean => {
    let complete = true;
    const data = node.data;
    // nf-core modules: one argument per input group. (The node has its module's
    // id; its definition may not be registered yet, the import brings it.)
    const moduleId = String(data.nwaveNfCoreModuleId ?? "");
    const groups = (moduleId && !moduleId.includes("subworkflows") ? (catalogGroups(moduleId) ?? []) : []) as NfCoreModuleInputGroup[];
    if (groups.length > 0) {
      const values: Record<string, unknown> = { ...((data.nfcoreValues as Record<string, unknown>) ?? {}) };
      [...groups]
        .sort((left, right) => left.argumentIndex - right.argumentIndex)
        .forEach((group, index) => {
          const argument = args[index];
          if (argument === undefined) return;
          const items = getGroupItems(group);
          const paths = items.filter((item) => item.kind === "path");
          const vals = items.filter((item) => item.kind === "val");
          // A placeholder for nothing connected: `[]`, `[[:], [], …]`.
          if (/^\[[\s[\]:,]*\]$/.test(argument.trim()) && paths.length > 0) return;
          if (paths.length === 0) {
            for (const item of vals) values[item.name] = settingValue(argument);
            return;
          }
          const resolved = resolveArgument(argument) ?? (paths.length === 1 ? argumentOperator(stepName, paths[0].name, argument) : null);
          if (!resolved) {
            complete = false;
            return;
          }
          resolved.forEach((from, position) => {
            const port = paths.length === 1 ? paths[0].name : paths[position]?.name;
            if (port) connect(from, node, port, paths.length === 1 ? position : 0);
          });
        });
      if (Object.keys(values).length > 0) node.data = { ...node.data, nfcoreValues: values };
      return complete;
    }
    // nf-core subworkflows: channel takes are ports, value takes settings.
    const takes = subworkflowTakes(String(data.nwaveNfCoreModuleId ?? ""));
    if (takes) {
      const values: Record<string, unknown> = { ...((data.nfcoreValues as Record<string, unknown>) ?? {}) };
      takes.forEach((take, index) => {
        const argument = args[index];
        if (argument === undefined) return;
        if (take.kind === "value") {
          values[take.name] = settingValue(argument);
          return;
        }
        // Its placeholder: nothing connected.
        if (normalize(argument) === normalize(String(take.defaultValue)) || /^channel\.(value|empty)\(/i.test(argument.trim())) return;
        const resolved = resolveArgument(argument) ?? argumentOperator(stepName, take.name, argument);
        if (!resolved) {
          complete = false;
          return;
        }
        resolved.forEach((from, position) => {
          connect(from, node, take.name, position);
        });
      });
      if (Object.keys(values).length > 0) node.data = { ...node.data, nfcoreValues: values };
      return complete;
    }
    const stored = data.customNodeDefinition as StoredCustomNode | undefined;
    if (stored) {
      const values: Record<string, unknown> = { ...((data.customNodeValues as Record<string, unknown>) ?? {}) };
      (stored.arguments ?? []).forEach((argument, index) => {
        const text = args[index];
        if (text === undefined) return;
        if (argument.kind === "val") {
          const literal = settingValue(text);
          const isLiteral = typeof literal !== "string" || unquote(text) !== null;
          if (!isLiteral && stored.id.startsWith("local-")) {
            // `params.word`, `channel.value(…)`: written back as it is.
            const input = stored.inputs.find((candidate) => candidate.name === argument.name);
            if (input) input.settingType = "expression";
            values[argument.name] = text.trim();
            return;
          }
          values[argument.name] = String(literal);
          return;
        }
        const resolved =
          resolveArgument(text.replace(/\.collect\(\)$/, "")) ??
          (argument.kind === "path" ? argumentOperator(stepName, argument.name, text) : null);
        if (!resolved) {
          complete = false;
          return;
        }
        const pathFields = argument.fields.filter((field) => field.kind === "path");
        resolved.forEach((from, position) => {
          const port = argument.kind === "path" ? argument.name : pathFields[position]?.name;
          if (port) connect(from, node, port, argument.kind === "path" ? position : 0);
        });
      });
      node.data = {
        ...node.data,
        customNodeValues: values,
        customNodeValueInputs: stored.inputs.filter((input) => input.kind === "val"),
      };
      return complete;
    }
    // Subworkflow takes, N-WAVE steps: arguments in input order.
    const inputs = (data.inputs ?? []) as PortData[];
    args.forEach((argument, index) => {
      const port = inputs[index]?.name ?? inputs[0]?.name;
      if (!port) return;
      const resolved = resolveArgument(argument) ?? argumentOperator(stepName, port, argument);
      if (!resolved) {
        // Value takes of a subworkflow: settings.
        if (index > 0 || inputs.length === 0) return;
        complete = false;
        return;
      }
      resolved.forEach((from, position) => {
        connect(from, node, port, position);
      });
    });
    return complete;
  };

  // Input nodes N-WAVE writes.
  const recognizeInput = (statement: Statement): boolean => {
    const text = statement.text.trim();
    const fileInput = text.match(
      /^(ch_\w+) = channel\.fromList\(params\.(\w+)\)\s*\.map \{ name -> file\("\$\{params\.inputdir\}\/\$\{name\}", checkIfExists: true\) \}$/,
    );
    const emptyInput = text.match(/^(ch_\w+) = channel\.empty\(\)$/);
    if (fileInput || (emptyInput && stringList(paramValue(emptyInput[1].slice(3)) ?? "") !== null)) {
      const variable = (fileInput ?? emptyInput)?.[1] as string;
      const param = fileInput ? fileInput[2] : variable.slice(3);
      const files = stringList(paramValue(param) ?? "[]") ?? [];
      usedParams.add(param);
      const node = addNode(
        variable,
        "fileInput",
        {
          ...definitionDefaults("fileInput"),
          ...inputFilesFor(files),
        },
        param === "files" ? "File Input" : param,
      );
      sources.set(variable, { nodeId: node.id, port: "out" });
      return true;
    }
    const sheet = isNwaveSamplesheet(text) ? text.match(/^(ch_\w+) = channel\.fromPath\(params\.(\w+), checkIfExists: true\)\s*\.splitCsv\(/) : null;
    if (sheet) {
      const reads = [...(text.match(/def reads = \[(.*?)\]\.findAll/)?.[1] ?? "").matchAll(/row\['([^']*)'\]/g)].map((match) => match[1]);
      const id = text.match(/\[id: row\['([^']*)'\]/)?.[1] ?? "sample";
      const fileName = (unquote((paramValue(sheet[2]) ?? "").replace(/^"\$\{params\.inputdir\}\//, "'").replace(/"$/, "'")) ?? "samplesheet.csv");
      usedParams.add(sheet[2]);
      const node = addNode(
        sheet[1],
        "samplesheet",
        {
          ...definitionDefaults("samplesheet"),
          samplesheet: inputs[fileName] && !inputs[fileName].encoding ? inputs[fileName].content : "",
          subtitle: inputs[fileName] ? "Samplesheet from the project" : "Upload the samplesheet again",
          samplesheetFileName: fileName,
          samplesheetMapping: { idColumn: id, read1Column: reads[0] ?? "fastq_1", read2Column: reads[1] ?? "" },
        },
        sheet[2] === "samplesheet" ? "Samplesheet" : sheet[2],
      );
      sources.set(sheet[1], { nodeId: node.id, port: "samples" });
      return true;
    }
    const reference = text.match(/^(ch_\w+) = channel\.of\(nwaveInputFile\(params\.(\w+)\)\)$/);
    if (reference && params.has(reference[2])) {
      fileParams.set(reference[2], reference[1]);
      return true;
    }
    return false;
  };

  // Glue: variables only read as whole step arguments, holding only adapting code.
  statements.forEach((statement, index) => {
    const defined = definedNames(statement.text);
    if (defined.length !== 1) return;
    const value = statement.text.replace(/^\s*[A-Za-z_]\w*\s*=\s*/, "");
    const laterUses = readsOf.slice(index + 1).filter((reads) => reads.variables.includes(defined[0]));
    if (laterUses.length === 0) return;
    const asArgument = statements.slice(index + 1).every((later) => {
      if (!usedNames(later.text, new Set(defined)).variables.length) return true;
      const call = callOf(later.text);
      return Boolean(call) && splitArguments(call?.args ?? "").includes(defined[0]);
    });
    const glueLike =
      tupleGlueParts(value) !== null ||
      (stripGlue(value) !== value.trim() && splitMix(stripGlue(value)).every((part) => /^[A-Za-z_]\w*(\.out(\.\w+)?)?$/.test(stripGlue(part)))) ||
      /\.filter \{ file -> file\.name == '/.test(value);
    if (asArgument && glueLike && !/\.filter \{ file -> file\.name == '/.test(value)) glue.set(defined[0], value);
    if (asArgument && /\.filter \{ file -> file\.name == '/.test(value)) selectedFiles.set(defined[0], value);
  });

  // A Parameters node holds the params the steps read, reference files as its outputs.
  const parametersPending = () => {
    const parameters: WorkflowParameter[] = [];
    for (const [name, value] of params) {
      if (usedParams.has(name) || name.includes(".")) continue;
      const file = fileParams.has(name);
      const item = paramItems.get(name);
      if (!file && item && !isLiteral(value)) {
        // Set from code (`"${projectDir}/data"`, `null`, a list): kept as written.
        keep(item, item.text, "script");
        continue;
      }
      const setting = settingValue(value);
      parameters.push({
        name,
        type: file ? "file" : typeof setting === "boolean" ? "boolean" : typeof setting === "number" ? "number" : "text",
        value: String(setting),
      });
    }
    return parameters;
  };

  // Walk the statements: inputs, steps, channel code.
  let group: Statement[] = [];
  let groupLabel: string | null = null;
  let groupEnd = 0;
  const flush = () => {
    if (group.length === 0) return;
    // What every statement after the group reads (glue included).
    operatorFor(group, groupLabel, [...readsOf.slice(groupEnd + 1), sectionReads]);
    group = [];
    groupLabel = null;
  };
  // Inputs first: steps read them.
  for (const statement of statements) recognizeInput(statement);
  const parameterList = parametersPending();
  if (parameterList.length > 0) {
    const node = addNode(
      "params",
      "parameters",
      {
        ...definitionDefaults("parameters"),
        parameters: parameterList,
        subtitle: `${parameterList.length} parameter${parameterList.length === 1 ? "" : "s"}`,
        outputs: parameterList
          .filter((parameter) => parameter.type === "file")
          .map((parameter) => ({ name: parameter.name, label: parameter.name, isConnectable: true })),
      },
      "Parameters",
    );
    for (const [param, variable] of fileParams) sources.set(variable, { nodeId: node.id, port: param });
  }
  // Inputs are recognized; reset and walk again for the rest (in order).
  statements.forEach((statement, index) => {
    const text = statement.text.trim();
    if (recognizeInputDry(text)) return;
    const defined = definedNames(text);
    if (defined.length === 1 && (glue.has(defined[0]) || selectedFiles.has(defined[0]))) return;
    const call = callOf(text);
    if (call && (processes.has(call.name) || includes.has(call.name) || namedWorkflows.has(call.name))) {
      flush();
      const args = splitArguments(call.args).map((argument) => {
        const selected = selectedFiles.get(argument.trim());
        return selected ? selected : argument;
      });
      if (step(call.name, args, text)) {
        const node = steps.get(call.name) as Node<NodeData>;
        for (const argument of args) {
          const filter = argument.match(/\.filter \{ file -> ((?:file\.name == '(?:[^'\\]|\\.)*'(?: \|\| )?)+) \}$/);
          if (filter && node.data.operatorType === "filter") {
            const names = [...filter[1].matchAll(/file\.name == '((?:[^'\\]|\\.)*)'/g)].map((match) => match[1].replace(/\\(.)/g, "$1"));
            node.data = { ...node.data, selectedFilterFiles: names.map((name) => ({ name, size: 0, content: "" })) };
          }
        }
        if (call.assigned) {
          sources.set(call.assigned, { nodeId: node.id, port: node.data.outputs?.[0]?.name ?? "out" });
          // `samples_ch = RNASEQ(…)`: written back so, for code that reads the name.
          node.data = { ...node.data, scriptAssigned: call.assigned };
        }
        if (statement.comments.length > 0) node.data = { ...node.data, scriptComments: statement.comments };
        return;
      }
    }
    // Channel code: one node per block (a comment or a blank line starts one),
    // named after its first comment.
    const label = statement.comments[0]?.match(/^\/\/\s*(.*)$/)?.[1]?.trim() ?? null;
    if (label !== null || statement.blankBefore || group.length === 0) {
      flush();
      // A bare `//` line names nothing: the node is named after its channel.
      groupLabel = label || null;
    }
    group.push(statement);
    groupEnd = index;
  });
  flush();

  // Steps the workflow doesn't call (or a script without a workflow) still show.
  for (const [name, text] of processes) {
    if (steps.has(name) || ownedByWorkflows.has(name)) continue;
    const made = stepForProcess(name, text);
    // Code calls it (`ch | FOO`, inside an `if`) or nothing does: export writes its definition, not a call.
    steps.set(name, addNode(name, made.type, { ...made.data, definitionOnly: true }, name));
  }

  // nf-core components only code calls (inside an `if`, `ch | FASTQC`): their includes stay.
  const usedInMain = new Set([...maskSource(mainText, { keepInterpolations: true }).matchAll(/(?<![.\w$])([A-Za-z_]\w*)\b/g)].map((match) => match[1]));
  for (const [alias, include] of includes) {
    if (steps.has(alias) || !usedInMain.has(alias)) continue;
    kept.push({
      placement: "script",
      start: 0,
      text: `include { ${include.name === alias ? alias : `${include.name} as ${alias}`} } from '${include.path}'`,
    });
  }

  // Code kept as written: one node for each place it goes.
  for (const placement of Object.keys(CODE_PLACEMENTS) as CodePlacement[]) {
    // Blocks apart by a blank line, one-line params together.
    const oneLineParam = (text: string) => /^params\.[\w.]+\s*=[^\n]*$/.test(text);
    const code = kept
      .filter((entry) => entry.placement === placement)
      .sort((a, b) => a.start - b.start)
      .map((entry) => entry.text)
      .reduce((all, text, index, texts) => {
        if (index === 0) return text;
        return `${all}${oneLineParam(text) && oneLineParam(texts[index - 1]) ? "\n" : "\n\n"}${text}`;
      }, "");
    if (!code) continue;
    addNode(
      CODE_PLACEMENTS[placement].key,
      "channelOperator",
      {
        subtitle: "Code kept as written",
        channelOperatorTemplate: "custom",
        channelOperatorCode: code,
        inputs: [],
        outputs: [],
        placement,
      },
      CODE_PLACEMENTS[placement].label,
    );
  }

  notes.forEach((note, index) => {
    addNode(`note_${index + 1}`, "note", { ...definitionDefaults("note"), noteText: note.text }, note.label);
  });

  // Steps keep the names the script gave them when their label wouldn't give the same.
  const derived = processNamesFor(nodes);
  for (const [name, node] of steps) {
    if (derived.get(node.id) !== name) node.data = { ...node.data, scriptName: name };
  }

  if (layout.size === 0 || nodes.some((node) => !layout.has(keyOf(node)))) {
    autoLayout(nodes, edges, new Set(nodes.filter((node) => layout.has(keyOf(node))).map((node) => node.id)));
  }
  if (!entry) warnings.push("No workflow block was found, so connections could not be read.");
  for (const node of nodes) {
    const group = groupOfStep.get(keyOf(node));
    if (group) node.data = { ...node.data, group };
  }

  return { name: headerName, nodes, edges, definitions, warnings };

  function keyOf(node: Node<NodeData>): string {
    return keys.get(node.id) ?? node.id;
  }

  function recognizeInputDry(text: string): boolean {
    const trimmed = text.trim();
    return (
      /^(ch_\w+) = channel\.fromList\(params\.(\w+)\)\s*\.map \{ name -> file\(/.test(trimmed) ||
      (/^(ch_\w+) = channel\.empty\(\)$/.test(trimmed) && stringList(paramValue(trimmed.slice(3, trimmed.indexOf(" "))) ?? "") !== null) ||
      (isNwaveSamplesheet(trimmed) && /^(ch_\w+) = channel\.fromPath\(params\.(\w+), checkIfExists: true\)\s*\.splitCsv\(/.test(trimmed)) ||
      (/^(ch_\w+) = channel\.of\(nwaveInputFile\(params\.(\w+)\)\)$/.test(trimmed) &&
        params.has(trimmed.match(/params\.(\w+)/)?.[1] ?? ""))
    );
  }
};

/** An nf-core subworkflow's takes (in call order), from the catalog; null for anything else. */
const subworkflowTakes = (id: string) =>
  id.startsWith("nf-core/subworkflows/") ? (subworkflows.find((entry) => entry.id === id)?.takes ?? null) : null;

/** An nf-core module's input groups (in call order), from the catalog. */
const catalogGroups = (moduleId: string): NfCoreModuleInputGroup[] | null =>
  ((modules.find((entry) => entry.id === moduleId) as unknown as { inputGroups?: NfCoreModuleInputGroup[] } | undefined)
    ?.inputGroups ?? null);

/** Settings N-WAVE writes into the config for an nf-core step (ext.args, prefix, publishing, resources). */
const applyNfCoreConfig = (node: Node<NodeData>, name: string, blocks: Map<string, string[]>) => {
  const lines = blocks.get(name) ?? blocks.get(`${name}:.*`) ?? [];
  const text = lines.join("\n");
  const value = (key: string): string | null => {
    const match = text.match(new RegExp(`^\\s*${key.replace(".", "\\.")}\\s*=\\s*(.+)$`, "m"));
    if (!match) return null;
    const raw = match[1].trim();
    const closure = raw.match(/^\{\s*"([\s\S]*)"\s*\}$/);
    if (closure) return closure[1].replace(/\\(["\\])/g, "$1");
    const single = raw.match(/^'((?:[^'\\]|\\.)*)'$/);
    if (single) return single[1].replace(/\\(.)/g, "$1");
    return raw;
  };
  const data: Record<string, unknown> = {};
  const args = value("ext.args");
  if (args !== null) data.nfcoreExtArgs = args;
  const prefix = value("ext.prefix");
  if (prefix !== null) data.nfcoreExtPrefix = prefix;
  // A step that saves its outputs has a publishDir.
  data.nfcorePublish = /publishDir\s*=/.test(text);
  const cpus = value("cpus");
  const memory = value("memory");
  const time = value("time");
  if (cpus !== null || memory !== null || time !== null) {
    data.overrideResources = true;
    if (cpus !== null) data.cpus = Number(cpus);
    if (memory !== null) data.memory = memory;
    if (time !== null) data.timeLimit = time;
  }
  const extra = lines.filter(
    (line) => line.trim() && !/^\s*(ext\.args|ext\.prefix|cpus|memory|time)\s*=/.test(line) && !/^\s*(publishDir = \[|path:|mode:|saveAs:|\])/.test(line),
  );
  if (extra.length > 0 && blocks.has(`${name}:.*`)) data.nfcoreProcessConfig = extra.join("\n");
  node.data = { ...node.data, ...data };
};

export type { LayoutEntry };
