import {
  publishDirLines,
  resultsFolderFor,
  savesOutputs,
} from "./nfcore/publish";
import type { Node } from "@xyflow/react";
import type { NodeData, PortData, PortKind } from "../components/nodes/BaseNode";
import NfCoreModulePanel from "../components/panels/process/NfCoreModulePanel";
import type { NodeDefinition } from "./nodeDefinitions";
import type {
  NodeGenerationContext,
  NodeGenerationResult,
} from "./nodeGeneration";
import { groovyStringWithParams, referencesParams } from "./params";
import {
  buildNfCoreGroupChannels,
  type NfCoreModuleInputGroup,
  type NfCoreValueInput,
} from "./nfcore/inputChannels";
import type { NfCoreSubworkflowTake } from "./nfcore/subworkflow";

export type {
  NfCoreModuleInputGroup,
  NfCoreValueInput,
} from "./nfcore/inputChannels";

export type NfCoreInputAdapter = "path" | "fastq_reads_with_meta";

/** What a port carries, from the module's meta.yml (see registry/portTypes.ts). */
export interface NfCorePortKind {
  kind?: PortKind;
  /** File name pattern, e.g. "*.{bam}". */
  filePattern?: string;
}

export interface NfCoreModuleInput extends NfCorePortKind {
  handle: string;
  nfcoreName: string;
  adapter: NfCoreInputAdapter;
  label?: string;
}

export interface NfCoreModuleOutput extends NfCorePortKind {
  handle: string;
  emit: string;
  label?: string;
  isConnectable?: boolean;
}

export interface NfCoreModuleAdapter {
  id: string;
  label: string;
  description: string;
  category: string;
  icon: string;
  processType: string;
  modulePath: string;
  processName: string;
  inputs: NfCoreModuleInput[];
  inputGroups?: NfCoreModuleInputGroup[];
  valueInputs?: NfCoreValueInput[];
  outputs: NfCoreModuleOutput[];
  defaults?: Partial<NodeData>;
  buildExtArgs?: (node: Node<NodeData>) => string;
}

export interface NfCoreAdapterManifest {
  schemaVersion: number;
  /** "subworkflow" for nf-core subworkflows; modules have none. */
  kind?: "module" | "subworkflow";
  id: string;
  label: string;
  description: string;
  processType: string;
  modulePath: string;
  processName: string;
  support: "candidate" | "needs_review" | "unsupported";
  needsReview?: boolean;
  /** Installed from an older catalog commit; reinstall to update. */
  outdated?: boolean;
  settings?: {
    extArgs: boolean;
    extArgNames?: string[];
    argumentReferences?: Array<{
      type: string;
      url: string;
    }>;
    resources: boolean;
  };
  installability?: {
    automatic: boolean;
    reasons: string[];
  };
  inputs: Array<NfCorePortKind & {
    handle: string;
    nfcoreName: string;
    adapter: NfCoreInputAdapter;
    label?: string;
  }>;
  inputGroups?: NfCoreModuleInputGroup[];
  valueInputs?: NfCoreValueInput[];
  outputs: Array<NfCorePortKind & {
    handle: string;
    emit: string;
    label?: string;
  }>;
  defaults?: Partial<NodeData>;
  /** Subworkflows: every `take`, in call order. */
  takes?: NfCoreSubworkflowTake[];
  /** Subworkflows: the modules and subworkflows included directly. */
  components?: { modules: string[]; subworkflows: string[] };
}

/** A port's kind fields, only those it has. */
const portKind = ({ kind, filePattern }: NfCorePortKind): NfCorePortKind => ({
  ...(kind ? { kind } : {}),
  ...(filePattern ? { filePattern } : {}),
});

/**
 * Inputs that gather files from many steps into one run (staged with
 * `collect`, such as MultiQC's reports) take any number of connections.
 */
const collectingInputs = (groups: NfCoreModuleInputGroup[] | undefined): Set<string> =>
  new Set(
    (groups ?? []).flatMap((group) =>
      (group.items ?? []).flatMap((item) => (item.kind === "path" && item.mode === "collect" ? [item.name] : [])),
    ),
  );

const nfCoreInputPorts = (
  inputs: NfCoreModuleAdapter["inputs"],
  groups: NfCoreModuleInputGroup[] | undefined,
): PortData[] => {
  const many = collectingInputs(groups);
  return inputs.map((input) => ({
    name: input.handle,
    label: input.label,
    isConnectable: true,
    ...portKind(input),
    ...(many.has(input.handle) ? { multiple: true } : {}),
  }));
};

export const createNodeDefinitionFromNfCoreAdapter = (
  adapter: NfCoreModuleAdapter
): NodeDefinition => {
  const inputs = nfCoreInputPorts(adapter.inputs, adapter.inputGroups);
  const outputs: PortData[] = adapter.outputs.map((output) => ({
    name: output.handle,
    label: output.label,
    isConnectable: output.isConnectable ?? true,
    ...portKind(output),
  }));

  return {
    id: adapter.processType,
    kind: "process",
    category: adapter.category,
    label: adapter.label,
    description: adapter.description,
    type: "process",
    icon: adapter.icon,
    processType: adapter.processType,
    inputs,
    outputs,
    defaults: {
      ...adapter.defaults,
      inputs,
      outputs,
      nwaveExecutionBackend: "nf-core",
      nwaveNfCoreModuleId: adapter.id,
    },
    panel: NfCoreModulePanel,
    generateNextflow: generateNfCoreModuleNode(adapter),
    executionLabel: adapter.label,
  };
};

export const createNodeDefinitionFromNfCoreManifest = (
  manifest: NfCoreAdapterManifest
): NodeDefinition => {
  const adapter: NfCoreModuleAdapter = {
    id: manifest.id,
    label: manifest.label,
    description: manifest.needsReview
      ? `${manifest.description} Requires adapter review before production use.`
      : manifest.description,
    category:
      manifest.needsReview ? "Installed nf-core (Review)" : "Installed nf-core",
    icon: "Package",
    processType: manifest.processType,
    modulePath: manifest.modulePath,
    processName: manifest.processName,
    inputs: manifest.inputs,
    inputGroups: manifest.inputGroups,
    valueInputs: manifest.valueInputs,
    outputs: manifest.outputs,
    defaults: {
      ...manifest.defaults,
      nfcoreValueInputs: manifest.valueInputs ?? [],
      nfcoreValues: Object.fromEntries(
        (manifest.valueInputs ?? []).map((input) => [
          input.name,
          input.defaultValue,
        ])
      ),
      processType: manifest.processType,
      label: manifest.label,
      subtitle: "nf-core module",
      inputs: nfCoreInputPorts(manifest.inputs, manifest.inputGroups),
      outputs: manifest.outputs.map((output) => ({
        name: output.handle,
        label: output.label,
        isConnectable: true,
        ...portKind(output),
      })),
      nwaveExecutionBackend: "nf-core",
      nwaveNfCoreModuleId: manifest.id,
      nwaveNfCoreNeedsReview: manifest.needsReview,
      nwaveNfCoreOutdated: manifest.outdated ?? false,
      nwaveNfCoreSupportsExtArgs: manifest.settings?.extArgs ?? false,
      nwaveNfCoreExtArgNames: manifest.settings?.extArgNames ?? [],
      nwaveNfCoreArgumentReferences:
        manifest.settings?.argumentReferences ?? [],
      nwaveNfCoreSupportsResources: manifest.settings?.resources ?? true,
    },
    buildExtArgs: (node) => String(node.data.nfcoreExtArgs ?? "").trim(),
  };

  return createNodeDefinitionFromNfCoreAdapter(adapter);
};

export const generateNfCoreModuleNode =
  (adapter: NfCoreModuleAdapter) =>
  (context: NodeGenerationContext): NodeGenerationResult | null => {
    const { node, processName, incomingEdges, resolveChannelNameForEdge, channelNameMap } =
      context;
    const moduleAlias = sanitizeProcessName(processName).toUpperCase();
    const includeStatement = `include { ${adapter.processName} as ${moduleAlias} } from '${adapter.modulePath}'`;
    const inputChannels = buildNfCoreInputChannels({
      adapter,
      data: node.data,
      processName,
      incomingEdges,
      resolveChannelNameForEdge,
      channelNameMap,
      sanitizeVarName: context.sanitizeVarName,
    });

    if (!inputChannels) return null;

    const outputAssignments = adapter.outputs.map((output) => {
      const outputVar =
        context.channelNameMap.get(`${node.id}.${output.handle}`) ??
        context.sanitizeVarName(`${processName}_${output.handle}`);
      return `    ${outputVar} = ${moduleAlias}.out.${output.emit}\n`;
    });

    const extArgs = adapter.buildExtArgs?.(node).trim();
    const configLines: string[] = [];

    if (extArgs) {
      // `${params.x}` references are filled in when the task runs.
      configLines.push(
        referencesParams(extArgs)
          ? `  ext.args = { ${groovyStringWithParams(extArgs)} }`
          : `  ext.args = ${groovyString(extArgs)}`
      );
    }

    // Output file prefix (`task.ext.prefix`). `${meta.id}` and friends need a
    // closure so they're read per task.
    const extPrefix = String(node.data.nfcoreExtPrefix ?? "").trim();
    if (extPrefix) {
      configLines.push(
        extPrefix.includes("${")
          ? `  ext.prefix = { "${extPrefix.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" }`
          : `  ext.prefix = ${groovyString(extPrefix)}`
      );
    }

    if (savesOutputs(node.data)) {
      configLines.push(
        ...publishDirLines(resultsFolderFor(node.data, moduleAlias))
      );
    }

    if (node.data.overrideResources) {
      const cpus = Number(node.data.cpus);
      if (Number.isFinite(cpus) && cpus > 0) {
        configLines.push(`  cpus = ${Math.floor(cpus)}`);
      }
      if (node.data.memory) {
        configLines.push(`  memory = ${groovyString(String(node.data.memory))}`);
      }
      if (node.data.timeLimit) {
        configLines.push(`  time = ${groovyString(String(node.data.timeLimit))}`);
      }
    }

    const configBlock =
      configLines.length > 0
        ? [`withName: '${moduleAlias}' {`, ...configLines, "}"].join("\n")
        : undefined;

    return {
      processScript: "",
      includeStatements: [includeStatement],
      nextflowConfigBlocks: configBlock ? [configBlock] : undefined,
      channelDefinitions: inputChannels
        .map((channel) => channel.definition)
        .filter((definition): definition is string => Boolean(definition)),
      processInvocations: [
        `${[
          `    ${moduleAlias}(${inputChannels.map((channel) => channel.name).join(", ")})`,
          ...outputAssignments.map((assignment) => assignment.trimEnd()),
        ].join("\n")}\n`,
      ],
      includeInExecutionOrder: false,
    };
  };

function buildAdaptedInputChannel({
  adapter,
  processName,
  handle,
  upstream,
  sanitizeVarName,
}: {
  adapter: NfCoreInputAdapter;
  processName: string;
  handle: string;
  upstream: string;
  sanitizeVarName: (name: string) => string;
}): { name: string; definition?: string } {
  if (adapter === "path") {
    return { name: upstream };
  }

  const channelName = sanitizeVarName(`ch_${processName}_${handle}_nfcore`);

  return {
    name: channelName,
    definition: [
      `    ${channelName} = ${upstream}.map { item ->`,
      "        def reads = item instanceof List && item.size() > 1 ? item[1] : item",
      "        def existingMeta = item instanceof List && item.size() > 0 && item[0] instanceof Map ? item[0] : [:]",
      "        def singleEnd = existingMeta.single_end == null ? true : existingMeta.single_end",
      "        def meta = existingMeta + [id: existingMeta.id ?: reads.baseName, single_end: singleEnd]",
      "        tuple(meta, reads)",
      "    }\n",
    ].join("\n"),
  };
}

function buildNfCoreInputChannels({
  adapter,
  data,
  processName,
  incomingEdges,
  resolveChannelNameForEdge,
  channelNameMap,
  sanitizeVarName,
}: {
  adapter: NfCoreModuleAdapter;
  data: NodeData;
  processName: string;
  incomingEdges: NodeGenerationContext["incomingEdges"];
  resolveChannelNameForEdge: NodeGenerationContext["resolveChannelNameForEdge"];
  channelNameMap: Map<string, string>;
  sanitizeVarName: (name: string) => string;
}): Array<{ name: string; definition?: string }> | null {
  if (!adapter.inputGroups || adapter.inputGroups.length === 0) {
    const inputChannels = adapter.inputs
      .map((input, index) => {
        const edge = findIncomingEdgeForHandle(incomingEdges, input.handle, index);
        if (!edge) return null;

        const upstream = resolveChannelNameForEdge(edge, channelNameMap);
        if (!upstream) return null;

        return buildAdaptedInputChannel({
          adapter: input.adapter,
          processName,
          handle: input.handle,
          upstream,
          sanitizeVarName,
        });
      })
      .filter(
        (channel): channel is { name: string; definition?: string } =>
          channel !== null
      );

    return inputChannels.length === adapter.inputs.length ? inputChannels : null;
  }

  return buildNfCoreGroupChannels({
    groups: adapter.inputGroups,
    valueInputs: adapter.valueInputs ?? [],
    data,
    processName,
    incomingEdges,
    resolveUpstream: (edge) => resolveChannelNameForEdge(edge, channelNameMap),
    sanitizeVarName,
  });
}

function findIncomingEdgeForHandle(
  incomingEdges: NodeGenerationContext["incomingEdges"],
  handle: string,
  fallbackIndex: number
) {
  return (
    incomingEdges.find((candidate) => {
      if (!candidate.targetHandle) return fallbackIndex === 0;
      return candidate.targetHandle === handle;
    }) ?? incomingEdges[fallbackIndex]
  );
}

function sanitizeProcessName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function groovyString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
