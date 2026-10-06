import type { Edge, Node } from "reactflow";
import type { NodeData, PortData } from "../components/nodes/BaseNode";
import {
  buildMixedChannelExpression,
  getProcessNameForNode,
  sanitizeVarName,
} from "../generators/core/generateNextflowScript";
import { getNodeDefinitionForNode } from "./nodeDefinitions";

/** An nf-core module a node includes instead of defining a process inline. */
export interface NfCoreModuleReference {
  /** Catalog id, e.g. "nf-core/fastqc". */
  id: string;
  /** Path used in the include statement, e.g. "./modules/nf-core/fastqc/main". */
  modulePath: string;
  /** Process name declared in the module, e.g. "FASTQC". */
  processName: string;
}

/** The Nextflow code a single node contributes to the generated script. */
export interface NodeCode {
  /** Process name the generator uses for this node. */
  processName: string;
  /** The node's own process definition ("" when it includes a module). */
  processSource: string;
  /** Set when the node runs an nf-core module instead of inline code. */
  nfCoreModule?: NfCoreModuleReference;
  includeStatements: string[];
  /** `process { ... }` config entries (e.g. ext.args, resources). */
  configBlocks: string[];
  /**
   * The node's lines inside the `workflow { }` block. Input channels use
   * placeholder names (`<port>_ch`) because they depend on the connections.
   */
  workflowSnippet: string;
  /** Whether the node is already a custom node. */
  isCustom: boolean;
}

const INCLUDE_PATTERN =
  /^include\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*\}\s*from\s*['"]([^'"]+)['"]/;

/** Placeholder channel name used for a node input port. */
export const placeholderChannelName = (port: string): string =>
  sanitizeVarName(`${port}_ch`);

const getPorts = (
  node: Node<NodeData>,
  key: "inputs" | "outputs",
): PortData[] => {
  const fromData = node.data[key];
  if (Array.isArray(fromData) && fromData.length > 0) return fromData;
  return getNodeDefinitionForNode(node)?.[key] ?? [];
};

/**
 * Run the node's generator in isolation, with one placeholder upstream
 * channel per input port, and return the code it produces. Returns null for
 * nodes that don't generate a process (e.g. file inputs).
 */
export const getNodeCode = (node: Node<NodeData>): NodeCode | null => {
  const definition = getNodeDefinitionForNode(node);
  if (!definition?.generateNextflow) return null;

  const processName = getProcessNameForNode(node);
  const inputs = getPorts(node, "inputs");
  const outputs = getPorts(node, "outputs");

  const incomingEdges: Edge[] = (
    inputs.length > 0 ? inputs : [{ name: "in" }]
  ).map((port, index) => ({
    id: `placeholder-${index}`,
    source: `upstream_${index}`,
    sourceHandle: "out",
    target: node.id,
    targetHandle: port.name,
  }));

  const channelNameMap = new Map<string, string>();
  for (const output of outputs) {
    channelNameMap.set(
      `${node.id}.${output.name}`,
      sanitizeVarName(`${processName}_${output.name}`),
    );
  }
  const firstOutput = outputs[0];

  const result = definition.generateNextflow({
    node,
    processName,
    incomingEdges,
    upstreamChannelName: placeholderChannelName(
      incomingEdges[0]?.targetHandle ?? "in",
    ),
    outputChannelName: firstOutput
      ? (channelNameMap.get(`${node.id}.${firstOutput.name}`) ?? null)
      : null,
    channelNameMap,
    outputDisplayCounter: 1,
    outputNamingPattern: "{workflow_name}_{timestamp}",
    workflowName: "workflow",
    timestamp: 0,
    date: "",
    resolveChannelNameForEdge: (edge) =>
      placeholderChannelName(edge.targetHandle ?? "in"),
    buildMixedChannelExpression,
    sanitizeVarName,
  });
  if (!result) return null;

  const includeStatements = result.includeStatements ?? [];
  const isCustom = typeof node.data.customNodeId === "string";
  // Custom nodes define their code inline; a custom workflow's includes are
  // the modules it calls, not the node's own code.
  const includeMatch = isCustom
    ? undefined
    : includeStatements
        .map((statement) => statement.match(INCLUDE_PATTERN))
        .find(Boolean);
  // Bundled nf-core nodes (FastQC, Trimmomatic) don't store their module id,
  // so fall back to the include path: ./modules/nf-core/<path>/main.
  const modulePath = includeMatch?.[2] ?? "";
  const moduleId =
    typeof node.data.nwaveNfCoreModuleId === "string"
      ? node.data.nwaveNfCoreModuleId
      : modulePath.match(/modules\/(nf-core\/.+)\/main$/)?.[1];

  return {
    processName,
    processSource: result.processScript.trim(),
    nfCoreModule:
      includeMatch && moduleId
        ? {
            id: moduleId,
            processName: includeMatch[1] ?? "",
            modulePath,
          }
        : undefined,
    includeStatements,
    configBlocks: result.nextflowConfigBlocks ?? [],
    workflowSnippet: [
      ...(result.channelDefinitions ?? []),
      ...result.processInvocations,
    ]
      .join("")
      .replace(/\n+$/, ""),
    isCustom,
  };
};
