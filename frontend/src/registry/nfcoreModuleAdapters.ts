import type { Node } from "reactflow";
import type { NodeData, PortData } from "../components/nodes/BaseNode";
import NfCoreModulePanel from "../components/panels/process/NfCoreModulePanel";
import type { NodeDefinition } from "./nodeDefinitions";
import type {
  NodeGenerationContext,
  NodeGenerationResult,
} from "./nodeGeneration";

export type NfCoreInputAdapter = "path" | "fastq_reads_with_meta";

export interface NfCoreModuleInput {
  handle: string;
  nfcoreName: string;
  adapter: NfCoreInputAdapter;
  label?: string;
}

export interface NfCoreModuleOutput {
  handle: string;
  emit: string;
  label?: string;
  isConnectable?: boolean;
}

export interface NfCoreModuleInputGroup {
  argumentIndex: number;
  handle: string;
  tuple: boolean;
  metaName: string | null;
  fields: string[];
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
  outputs: NfCoreModuleOutput[];
  defaults?: Partial<NodeData>;
  buildExtArgs?: (node: Node<NodeData>) => string;
}

export interface NfCoreAdapterManifest {
  schemaVersion: number;
  id: string;
  label: string;
  description: string;
  processType: string;
  modulePath: string;
  processName: string;
  support: "full" | "candidate" | "needs_review" | "unsupported";
  needsReview?: boolean;
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
    requiresReview: boolean;
    reasons: string[];
  };
  inputs: Array<{
    handle: string;
    nfcoreName: string;
    adapter: NfCoreInputAdapter;
    label?: string;
  }>;
  inputGroups?: NfCoreModuleInputGroup[];
  outputs: Array<{
    handle: string;
    emit: string;
    label?: string;
  }>;
  defaults?: Partial<NodeData>;
}

export const fastqcNfCoreAdapter: NfCoreModuleAdapter = {
    id: "nf-core/fastqc",
    label: "FastQC",
    description:
      "Run nf-core FastQC on raw sequencing reads and emit HTML/ZIP QC reports.",
    category: "Quality Control",
    icon: "ClipboardCheck",
    processType: "nfcore_fastqc",
    modulePath: "./modules/nf-core/fastqc/main",
    processName: "FASTQC",
    inputs: [
      {
        handle: "reads",
        nfcoreName: "reads",
        adapter: "fastq_reads_with_meta",
        label: "FASTQ",
      },
    ],
    outputs: [
      { handle: "html", emit: "html", label: "HTML Reports" },
      { handle: "zip", emit: "zip", label: "ZIP Archives" },
      { handle: "versions", emit: "versions_fastqc", label: "Versions" },
    ],
    defaults: {
      processType: "nfcore_fastqc",
      label: "FastQC",
      subtitle: "nf-core module",
      note: "Adapter generated",
      cpus: 2,
      memory: "4.GB",
    },
    buildExtArgs: (node) => {
      const parts = [
        node.data.nogroup ? "--nogroup" : "",
        node.data.format ? `--format ${shellQuote(String(node.data.format))}` : "",
        node.data.kmers ? `--kmers ${Number(node.data.kmers)}` : "",
        node.data.adapters ? `--adapters ${shellQuote(String(node.data.adapters))}` : "",
        node.data.limits ? `--limits ${shellQuote(String(node.data.limits))}` : "",
      ];

      return parts.filter(Boolean).join(" ");
    },
  };

export const trimmomaticNfCoreAdapter: NfCoreModuleAdapter = {
    id: "nf-core/trimmomatic",
    label: "Trimmomatic",
    description:
      "Run nf-core Trimmomatic for FASTQ quality trimming and filtering.",
    category: "Preprocessing",
    icon: "Scissors",
    processType: "nfcore_trimmomatic",
    modulePath: "./modules/nf-core/trimmomatic/main",
    processName: "TRIMMOMATIC",
    inputs: [
      {
        handle: "reads",
        nfcoreName: "reads",
        adapter: "fastq_reads_with_meta",
        label: "FASTQ",
      },
    ],
    outputs: [
      { handle: "trimmed_reads", emit: "trimmed_reads", label: "Trimmed" },
      { handle: "unpaired_reads", emit: "unpaired_reads", label: "Unpaired" },
      { handle: "trim_log", emit: "trim_log", label: "Trim Log" },
      { handle: "out_log", emit: "out_log", label: "Output Log" },
      { handle: "summary", emit: "summary", label: "Summary" },
      {
        handle: "versions",
        emit: "versions_trimmomatic",
        label: "Versions",
      },
    ],
    defaults: {
      processType: "nfcore_trimmomatic",
      label: "Trimmomatic",
      subtitle: "nf-core module",
      note: "Adapter generated",
      leading: 3,
      trailing: 3,
      slidingwindow: "4:15",
      minlen: 36,
      phred_score: "33",
      cpus: 4,
      memory: "4.GB",
    },
    buildExtArgs: (node) => {
      const steps = [
        `LEADING:${node.data.leading ?? 3}`,
        `TRAILING:${node.data.trailing ?? 3}`,
        `SLIDINGWINDOW:${node.data.slidingwindow ?? "4:15"}`,
        `MINLEN:${node.data.minlen ?? 36}`,
      ];

      if (node.data.adapter_file) {
        steps.push(`ILLUMINACLIP:${node.data.adapter_file}`);
      }

      if (node.data.custom_steps) {
        steps.push(
          ...String(node.data.custom_steps)
            .split("\n")
            .map((step) => step.trim())
            .filter(Boolean)
        );
      }

      return `-phred${node.data.phred_score ?? "33"} ${steps.join(" ")}`;
    },
  };

export const nfCoreModuleAdapters: NfCoreModuleAdapter[] = [
  fastqcNfCoreAdapter,
  trimmomaticNfCoreAdapter,
];

export const createNodeDefinitionFromNfCoreAdapter = (
  adapter: NfCoreModuleAdapter
): NodeDefinition => {
  const inputs: PortData[] = adapter.inputs.map((input) => ({
    name: input.handle,
    label: input.label,
    isConnectable: true,
  }));
  const outputs: PortData[] = adapter.outputs.map((output) => ({
    name: output.handle,
    label: output.label,
    isConnectable: output.isConnectable ?? true,
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
    outputs: manifest.outputs,
    defaults: {
      ...manifest.defaults,
      processType: manifest.processType,
      label: manifest.label,
      subtitle: "nf-core module",
      inputs: manifest.inputs.map((input) => ({
        name: input.handle,
        label: input.label,
        isConnectable: true,
      })),
      outputs: manifest.outputs.map((output) => ({
        name: output.handle,
        label: output.label,
        isConnectable: true,
      })),
      nwaveExecutionBackend: "nf-core",
      nwaveNfCoreModuleId: manifest.id,
      nwaveNfCoreNeedsReview: manifest.needsReview,
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
      configLines.push(`  ext.args = ${groovyString(extArgs)}`);
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
  processName,
  incomingEdges,
  resolveChannelNameForEdge,
  channelNameMap,
  sanitizeVarName,
}: {
  adapter: NfCoreModuleAdapter;
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

  const inputsByHandle = new Map(
    adapter.inputs.map((input) => [input.handle, input])
  );
  const inputChannels: Array<{ name: string; definition?: string }> = [];

  for (const group of adapter.inputGroups
    .slice()
    .sort((left, right) => left.argumentIndex - right.argumentIndex)) {
    const fields = group.fields
      .map((field, fieldIndex) => {
        const input = inputsByHandle.get(field);
        const edge = findIncomingEdgeForHandle(incomingEdges, field, fieldIndex);
        if (!input || !edge) return null;

        const upstream = resolveChannelNameForEdge(edge, channelNameMap);
        if (!upstream) return null;

        return { input, upstream };
      })
      .filter(
        (field): field is { input: NfCoreModuleInput; upstream: string } =>
          field !== null
      );

    if (fields.length !== group.fields.length) return null;

    if (!group.tuple && fields.length === 1) {
      inputChannels.push(
        buildAdaptedInputChannel({
          adapter: fields[0].input.adapter,
          processName,
          handle: fields[0].input.handle,
          upstream: fields[0].upstream,
          sanitizeVarName,
        })
      );
      continue;
    }

    const channelName = sanitizeVarName(
      `ch_${processName}_${group.handle}_nfcore_group`
    );
    inputChannels.push({
      name: channelName,
      definition: buildTupleInputGroupDefinition({
        channelName,
        fields,
        metaName: group.metaName,
      }),
    });
  }

  return inputChannels;
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

function buildTupleInputGroupDefinition({
  channelName,
  fields,
  metaName,
}: {
  channelName: string;
  fields: Array<{ input: NfCoreModuleInput; upstream: string }>;
  metaName: string | null;
}): string {
  const expression = fields
    .slice(1)
    .reduce(
      (current, field) => `${current}.combine(${field.upstream})`,
      fields[0].upstream
    );
  const args = fields.map((_, index) => `item${index}`);
  const valueLines = fields.map(
    (field, index) =>
      `        def ${field.input.handle} = extractNwavePath(item${index})`
  );
  const firstHandle = fields[0].input.handle;
  const tupleValues = [
    metaName ? "meta" : undefined,
    ...fields.map((field) => field.input.handle),
  ].filter(Boolean);

  return [
    `    ${channelName} = ${expression}.map { ${args.join(", ")} ->`,
    "        def extractNwavePath = { item -> item instanceof List && item.size() > 0 ? item[-1] : item }",
    ...valueLines,
    metaName
      ? `        def meta = [id: ${firstHandle}.baseName]`
      : undefined,
    `        tuple(${tupleValues.join(", ")})`,
    "    }\n",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function sanitizeProcessName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function groovyString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export const nfCoreNodeDefinitions: NodeDefinition[] = nfCoreModuleAdapters.map(
  createNodeDefinitionFromNfCoreAdapter
);
