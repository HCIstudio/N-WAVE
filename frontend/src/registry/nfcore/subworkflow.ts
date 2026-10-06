import { publishDirLines, resultsFolderFor, savesOutputs } from "./publish";
// nf-core subworkflow nodes: a subworkflow's channel `take`s are the node's
// input ports, its value `take`s are settings and its `emit`s are outputs.
// The generated code includes the subworkflow from
// ./subworkflows/nf-core/<name>/main and calls it like a module.

import type { NodeData, PortData } from "../../components/nodes/BaseNode";
import NfCoreSubworkflowPanel from "../../components/panels/process/NfCoreSubworkflowPanel";
import type { NodeDefinition } from "../nodeDefinitions";
import type { NodeGenerator } from "../nodeGeneration";
import type { NfCoreAdapterManifest } from "../nfcoreModuleAdapters";
import { type NfCoreValueType, valueLiteral } from "./inputChannels";

export interface NfCoreSubworkflowTake {
  name: string;
  /** A channel take is an input port; a value take is a setting. */
  kind: "channel" | "value";
  type: NfCoreValueType;
  description: string;
  /** Value setting default, or the expression for an unconnected channel. */
  defaultValue: string | number | boolean;
}

/** The catalog fields needed to build a subworkflow's manifest. */
export interface NfCoreSubworkflowCatalogEntry {
  id: string;
  name: string;
  label: string;
  description: string;
  workflowName: string;
  takes: NfCoreSubworkflowTake[];
  emits: Array<{ name: string; description: string }>;
  components: { modules: string[]; subworkflows: string[] };
  support: NfCoreAdapterManifest["support"];
  installability?: NfCoreAdapterManifest["installability"];
}

export const isNfCoreSubworkflowId = (id: string): boolean =>
  id.startsWith("nf-core/subworkflows/");

const toTitle = (value: string): string =>
  value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

/** Mirrors buildSubworkflowManifest in backend/src/nfcore/library.ts. */
export const buildNfCoreSubworkflowManifest = (
  entry: NfCoreSubworkflowCatalogEntry,
): NfCoreAdapterManifest => ({
  schemaVersion: 3,
  kind: "subworkflow",
  id: entry.id,
  label: entry.label,
  description: entry.description,
  processType: `nfcore_subworkflow_${entry.name}`,
  modulePath: `./subworkflows/nf-core/${entry.name}/main`,
  processName: entry.workflowName,
  support: entry.support,
  needsReview: false,
  installability: entry.installability,
  takes: entry.takes,
  components: entry.components,
  inputs: entry.takes
    .filter((take) => take.kind === "channel")
    .map((take) => ({
      handle: take.name,
      nfcoreName: take.name,
      adapter: "path",
      label: toTitle(take.name),
    })),
  outputs: entry.emits.map((emit) => ({
    handle: emit.name,
    emit: emit.name,
    label: toTitle(emit.name),
  })),
  defaults: {
    label: entry.label,
    subtitle: "nf-core subworkflow",
    note: "Imported from nf-core catalog",
    nwaveExecutionBackend: "nf-core",
    nwaveNfCoreModuleId: entry.id,
  },
});

/**
 * Generate the include and call of a subworkflow. Channel takes get the
 * connected channel (several connections are mixed); unconnected ones get
 * their placeholder expression from the settings. Waits for at least one
 * connection.
 */
export const generateNfCoreSubworkflowNode =
  (manifest: NfCoreAdapterManifest): NodeGenerator =>
  ({
    node,
    processName,
    incomingEdges,
    channelNameMap,
    resolveChannelNameForEdge,
    buildMixedChannelExpression,
    sanitizeVarName,
  }) => {
    const takes = manifest.takes ?? [];
    let connected = 0;
    const args = takes.map((take) => {
      if (take.kind === "channel") {
        const upstream = incomingEdges
          .filter((edge) => edge.targetHandle === take.name)
          .map((edge) => resolveChannelNameForEdge(edge, channelNameMap))
          .filter((name): name is string => Boolean(name));
        if (upstream.length > 0) {
          connected += 1;
          return buildMixedChannelExpression(upstream);
        }
      }
      return valueLiteral(
        {
          name: take.name,
          type: take.kind === "channel" ? "expression" : take.type,
          defaultValue: take.defaultValue,
        },
        node.data,
      );
    });
    if (connected === 0) return null;

    const alias = sanitizeVarName(processName).toUpperCase();
    const outputs = manifest.outputs.map((output) => {
      const variable =
        channelNameMap.get(`${node.id}.${output.handle}`) ??
        sanitizeVarName(`${processName}_${output.handle}`);
      return `    ${variable} = ${alias}.out.${output.emit}`;
    });
    const processConfig = String(node.data.nfcoreProcessConfig ?? "").trim();
    // Every process inside the subworkflow saves to the node's folder.
    const publishConfig = savesOutputs(node.data)
      ? [
          `withName: '${alias}:.*' {`,
          ...publishDirLines(resultsFolderFor(node.data, alias)),
          "}",
        ].join("\n")
      : "";
    const configBlocks = [publishConfig, processConfig].filter(Boolean);

    return {
      processScript: "",
      includeStatements: [
        `include { ${manifest.processName} as ${alias} } from '${manifest.modulePath}'`,
      ],
      // Raw selectors from the settings; inner processes are named
      // "<alias>:<PROCESS>", so `withName: '.*:SALMON_QUANT'` matches.
      nextflowConfigBlocks: configBlocks.length > 0 ? configBlocks : undefined,
      processInvocations: [
        `${[`    ${alias}(${args.join(", ")})`, ...outputs].join("\n")}\n`,
      ],
      includeInExecutionOrder: false,
    };
  };

/** The node definition of an installed subworkflow. */
export const createNodeDefinitionFromNfCoreSubworkflowManifest = (
  manifest: NfCoreAdapterManifest,
): NodeDefinition => {
  const takes = manifest.takes ?? [];
  const inputs: PortData[] = manifest.inputs.map((input) => ({
    name: input.handle,
    label: input.label,
    isConnectable: true,
  }));
  const outputs: PortData[] = manifest.outputs.map((output) => ({
    name: output.handle,
    label: output.label,
    isConnectable: true,
  }));
  const defaults: Partial<NodeData> = {
    ...manifest.defaults,
    processType: manifest.processType,
    label: manifest.label,
    subtitle: "nf-core subworkflow",
    inputs,
    outputs,
    nwaveExecutionBackend: "nf-core",
    nwaveNfCoreModuleId: manifest.id,
    nwaveNfCoreOutdated: manifest.outdated ?? false,
    nfcoreSubworkflowTakes: takes,
    nfcoreSubworkflowComponents: manifest.components,
    nfcoreValues: Object.fromEntries(
      takes.map((take) => [take.name, take.defaultValue]),
    ),
  };

  return {
    id: manifest.processType,
    kind: "process",
    category: "Installed nf-core subworkflows",
    label: manifest.label,
    description: manifest.description,
    type: "process",
    icon: "Workflow",
    processType: manifest.processType,
    inputs,
    outputs,
    defaults,
    panel: NfCoreSubworkflowPanel,
    generateNextflow: generateNfCoreSubworkflowNode(manifest),
    executionLabel: manifest.label,
  };
};
