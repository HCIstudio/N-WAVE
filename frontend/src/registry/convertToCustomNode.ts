import type { Edge, Node } from "reactflow";
import type { NodeData } from "../components/nodes/BaseNode";
import {
  type CustomNodeInput,
  type CustomNodeSettingType,
  createNodeDefinitionFromCustomNode,
  createStoredCustomNode,
  type ParsedCustomNodeSource,
  parseCustomNodeSource,
  type StoredCustomNode,
} from "./customNodes";
import { isSubworkflowPublishBlock } from "./nfcore/publish";
import type { NfCoreSubworkflowTake } from "./nfcore/subworkflow";
import type { NodeCode } from "./nodeCode";

/** Old port name -> new port name, for inputs and outputs. */
export interface PortMapping {
  inputs: Record<string, string>;
  outputs: Record<string, string>;
}

export interface CustomNodeConversion {
  customNode: StoredCustomNode;
  ports: PortMapping;
}

/** "Trim Galore!" -> "TRIM_GALORE" (a valid Nextflow process name). */
export const toProcessName = (label: string): string => {
  const name = label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[A-Z]/.test(name) ? name : `PROCESS_${name || "CUSTOM"}`;
};

const renameFirstProcess = (source: string, name: string): string =>
  source.replace(
    /\bprocess\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/,
    `process ${name} {`,
  );

/** The statements inside each `withName: '...' { ... }` config block. */
const configStatements = (configBlocks: string[]): string[] =>
  configBlocks.flatMap((block) =>
    block
      .split("\n")
      .slice(1, -1)
      .map((line) => line.trim())
      .filter(Boolean),
  );

/**
 * For an nf-core subworkflow node, type the takes like the node does (the
 * catalog knows which are values from meta.yml) and carry over its settings:
 * values become setting defaults, placeholders the unconnected-input values.
 */
const withSubworkflowSettings = (
  parsed: ParsedCustomNodeSource,
  node: Node<NodeData>,
): ParsedCustomNodeSource => {
  const takes: NfCoreSubworkflowTake[] = Array.isArray(
    node.data.nfcoreSubworkflowTakes,
  )
    ? node.data.nfcoreSubworkflowTakes
    : [];
  if (parsed.kind !== "workflow" || takes.length === 0) return parsed;

  const values = (node.data.nfcoreValues ?? {}) as Record<string, unknown>;
  const settingTypes: Record<string, CustomNodeSettingType> = {
    boolean: "boolean",
    integer: "integer",
    float: "float",
    string: "text",
    expression: "expression",
  };
  const inputs = parsed.inputs.map((input): CustomNodeInput => {
    const take = takes.find((candidate) => candidate.name === input.name);
    if (!take) return input;
    const value = String(values[take.name] ?? take.defaultValue);
    return take.kind === "channel"
      ? {
          name: input.name,
          kind: "path",
          label: input.label,
          fileType: input.fileType,
          emptyValue: value,
        }
      : {
          name: input.name,
          kind: "val",
          label: input.label,
          settingType: settingTypes[take.type] ?? "text",
          defaultValue: value,
        };
  });
  return {
    ...parsed,
    inputs,
    arguments: inputs.map((input) => ({
      kind: input.kind,
      name: input.name,
      fields: [{ kind: input.kind, name: input.name }],
    })),
  };
};

/**
 * Map each old port to a new one: same name first, then a name that extends
 * the other (e.g. "versions" -> "versions_fastqc"), then by position when
 * both sides have the same number of ports.
 */
export const mapPorts = (
  oldPorts: string[],
  newPorts: string[],
): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const assign = (oldPort: string, newPort: string | undefined) => {
    if (!newPort || used.has(newPort) || mapping[oldPort]) return;
    mapping[oldPort] = newPort;
    used.add(newPort);
  };

  for (const oldPort of oldPorts) {
    assign(
      oldPort,
      newPorts.find((newPort) => newPort === oldPort),
    );
  }
  for (const oldPort of oldPorts) {
    assign(
      oldPort,
      newPorts.find(
        (newPort) =>
          !used.has(newPort) &&
          (newPort.startsWith(`${oldPort}_`) ||
            oldPort.startsWith(`${newPort}_`)),
      ),
    );
  }
  if (oldPorts.length === newPorts.length) {
    oldPorts.forEach((oldPort, index) => assign(oldPort, newPorts[index]));
  }
  return mapping;
};

/**
 * Build an editable custom node from any node's code. For nf-core nodes pass
 * the module's `main.nf` as `moduleSource`; bundled nodes use their inline
 * process. Settings that only lived in config (e.g. ext.args) are carried
 * over as config statements.
 */
export const buildCustomNodeFromNode = (
  node: Node<NodeData>,
  code: NodeCode,
  moduleSource?: string,
): CustomNodeConversion => {
  const label = String(node.data.label || "Node");
  const source = code.nfCoreModule
    ? (moduleSource ?? "").trim()
    : renameFirstProcess(code.processSource, toProcessName(label));
  if (!source) {
    throw new Error(`No Nextflow code available for "${label}".`);
  }

  const parsed = withSubworkflowSettings(parseCustomNodeSource(source), node);
  const isWorkflow = parsed.kind === "workflow";
  if (!parsed.processName) {
    throw new Error(`Could not find a process declaration for "${label}".`);
  }

  // Bundled operators like Merge pass all upstream files to one task.
  const collectsInputs = /\.collect\(\)\)/.test(code.workflowSnippet);
  const inputs = parsed.inputs.map((input) =>
    collectsInputs && input.kind === "path" && !isWorkflow
      ? { ...input, collect: true }
      : input,
  );

  const customNode: StoredCustomNode = {
    ...createStoredCustomNode(
      {
        label: `${label} (custom)`,
        description: code.nfCoreModule
          ? `Editable copy of the nf-core ${isWorkflow ? "subworkflow" : "module"} ${code.nfCoreModule.id}.`
          : `Editable copy of the ${label} node.`,
        icon: typeof node.data.icon === "string" ? node.data.icon : "Code",
        source,
      },
      parsed,
      { inputs, outputs: parsed.outputs },
    ),
    // A subworkflow's config holds whole selectors; keep them as written.
    config: isWorkflow
      ? code.configBlocks
          .filter((block) => !isSubworkflowPublishBlock(block))
          .join("\n")
          .split("\n")
          .filter((line) => line.trim())
      : configStatements(code.configBlocks),
  };

  const portNames = (key: "inputs" | "outputs") =>
    (node.data[key] ?? []).map((port) => port.name);

  return {
    customNode,
    ports: {
      inputs: mapPorts(
        portNames("inputs"),
        inputs
          .filter((input) => input.kind === "path")
          .map((input) => input.name),
      ),
      outputs: mapPorts(
        portNames("outputs"),
        parsed.outputs.map((output) => output.name),
      ),
    },
  };
};

/**
 * Point the edges of a converted node at its new ports. Edges whose port has
 * no counterpart are returned in `removed`.
 */
export const remapEdges = (
  edges: Edge[],
  nodeId: string,
  ports: PortMapping,
): { edges: Edge[]; removed: Edge[] } => {
  const kept: Edge[] = [];
  const removed: Edge[] = [];

  for (const edge of edges) {
    if (edge.target === nodeId) {
      const handle = ports.inputs[edge.targetHandle ?? ""];
      if (!handle) {
        removed.push(edge);
        continue;
      }
      kept.push({ ...edge, targetHandle: handle });
    } else if (edge.source === nodeId) {
      const handle = ports.outputs[edge.sourceHandle ?? ""];
      if (!handle) {
        removed.push(edge);
        continue;
      }
      kept.push({ ...edge, sourceHandle: handle });
    } else {
      kept.push(edge);
    }
  }

  return { edges: kept, removed };
};

/**
 * The canvas node that replaces `node` after conversion: same id and
 * position, the custom node's ports and defaults, and the original label.
 */
export const buildConvertedNode = (
  node: Node<NodeData>,
  customNode: StoredCustomNode,
): Node<NodeData> => {
  const definition = createNodeDefinitionFromCustomNode(customNode);
  return {
    ...node,
    type: definition.type,
    data: {
      ...definition.defaults,
      label: String(node.data.label || customNode.label),
    },
  };
};
