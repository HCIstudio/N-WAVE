// A canvas as a DAW model (dawModel.ts). The mapping, following the
// metamodel's published Nextflow mapping where it has one
// (https://github.com/CRC-FONDA/T1-DAW-Metamodel, mappings/):
//
//   the workflow                          DAW
//   a group of steps (#221)               sub-DAW with its Tasks
//   nf-core subworkflow, pipeline,
//   custom workflow node                  sub-DAW by reference (its parts aren't listed)
//   process, nf-core module, Filter,
//   Map, Merge                            Task: Executable (its container: ExecutionContext)
//   a step without an implementation      Task (the solution idea only)
//   channel code                          Task: InlineDescription
//   channel code that decides which
//   steps get data (if, branch, filter)   Task: SkipTask (InterconnectionManipulation)
//   onComplete / onError code             Task: Monitor
//   File Input, Samplesheet,
//   Display Output                        Storage: FileStorage
//   Parameters                            Storage: IntermediateStorage (FileStorage when all are files)
//   a connection                          StreamingInterconnection (a channel);
//                                         SimpleSendDataInterconnection from a single value
//   process settings (ext.args, …)        ExecutionContext of the Task
//
// Notes and positions have no class in the metamodel; they are in `nwave`.

import type { Edge, Node } from "@xyflow/react";
import type { NodeData, PortData } from "../components/nodes/BaseNode";
import { placementOf } from "../generators/core/placement";
import { groupsOf, groupTitle } from "../groups/groups";
import { isNfCoreSubworkflowId } from "../registry/nfcore/subworkflow";
import { getNodeCode } from "../registry/nodeCode";
import { getNodeDefinitionForNode } from "../registry/nodeDefinitions";
import { getNodeParameters } from "../registry/params";
import { isPlaceholder } from "./placeholder";
import {
  DAW_METAMODEL,
  DAW_SCHEMA,
  type Daw,
  type DawExecutionContext,
  type DawInterconnection,
  type DawModelFile,
  type DawPort,
  type DawStorage,
  type DawTask,
  type DawTaskType,
  type NwaveNode,
} from "./dawModel";

export interface DawModelSource {
  nodes: Node<NodeData>[];
  edges: Edge[];
  workflowName: string;
  description?: string;
  /** The workflow's run settings; run profiles (clusters, accounts) are left out. */
  settings?: Record<string, unknown>;
}

const labelOf = (node: Node<NodeData>): string => String(node.data.label || node.type || node.id);

const portsOf = (node: Node<NodeData>, key: "inputs" | "outputs"): DawPort[] => {
  const own = node.data[key];
  const ports: PortData[] = Array.isArray(own) && own.length > 0 ? own : (getNodeDefinitionForNode(node)?.[key] ?? []);
  return ports.map((port) => ({
    name: String(port.name),
    ...(port.label && port.label !== port.name ? { label: String(port.label) } : {}),
  }));
};

/** JSON as it is saved: no undefined, no functions, keys in a stable order. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const nwaveNode = (node: Node<NodeData>, index: number): NwaveNode => {
  // What the canvas adds while it is shown isn't part of the workflow.
  const { isHighlight: _isHighlight, ...data } = node.data as Record<string, unknown>;
  return {
    type: String(node.type),
    data: plain(data),
    position: { x: Math.round(node.position?.x ?? 0), y: Math.round(node.position?.y ?? 0) },
    index,
  };
};

/** Channel code that decides which steps get data: an `if`, or the branch and filter operators. */
const routesData = (code: string): boolean => /(^|[^.\w])if\s*\(|\.\s*(branch|filter)\s*[{(]/.test(code);

type Kind =
  | { kind: "task"; type: DawTaskType }
  | { kind: "storage"; type: DawStorage["type"] }
  | { kind: "daw"; reference: string }
  | { kind: "note" };

export const classifyNode = (node: Node<NodeData>): Kind => {
  const data = node.data as Record<string, unknown>;
  switch (node.type) {
    case "note":
      return { kind: "note" };
    case "fileInput":
    case "samplesheet":
    case "outputDisplay":
      return { kind: "storage", type: "FileStorage" };
    case "parameters": {
      const parameters = getNodeParameters(data);
      return {
        kind: "storage",
        type: parameters.length > 0 && parameters.every((parameter) => parameter.type === "file") ? "FileStorage" : "IntermediateStorage",
      };
    }
    case "pipeline":
      return { kind: "daw", reference: `nf-core/${String(data.pipelineName ?? "").replace(/^nf-core\//, "")}` };
    case "channelOperator": {
      const placement = placementOf(data);
      if (placement === "onComplete" || placement === "onError") return { kind: "task", type: "Monitor" };
      return { kind: "task", type: routesData(String(data.channelOperatorCode ?? "")) ? "SkipTask" : "InlineDescription" };
    }
    default: {
      const nfCoreId = typeof data.nwaveNfCoreModuleId === "string" ? data.nwaveNfCoreModuleId : "";
      if (nfCoreId && isNfCoreSubworkflowId(nfCoreId)) return { kind: "daw", reference: nfCoreId };
      const stored = data.customNodeDefinition as { kind?: string; processName?: string } | undefined;
      if (stored?.kind === "workflow") return { kind: "daw", reference: String(stored.processName ?? labelOf(node)) };
      return { kind: "task", type: isPlaceholder(node) ? "Task" : "Executable" };
    }
  }
};

const containerIn = (source: string): string | undefined => source.match(/^\s*container\s+['"]([^'"$]+)['"]/m)?.[1];

const taskOf = (node: Node<NodeData>, type: DawTaskType, index: number): DawTask => {
  const data = node.data as Record<string, unknown>;
  const task: DawTask = { id: node.id, name: labelOf(node), type };
  if (typeof data.description === "string" && data.description) task.description = data.description;
  const inputs = portsOf(node, "inputs");
  const outputs = portsOf(node, "outputs");
  if (inputs.length > 0) task.inputs = inputs;
  if (outputs.length > 0) task.outputs = outputs;
  if (node.type === "channelOperator") {
    const code = String(data.channelOperatorCode ?? "");
    if (code.trim()) task.implementation = { language: "nextflow", code };
  } else if (type !== "Task") {
    let code: ReturnType<typeof getNodeCode> = null;
    try {
      code = getNodeCode(node);
    } catch {
      // A node whose code can't be written yet (settings missing) is still a task.
    }
    if (code) {
      task.implementation = {
        language: "nextflow",
        ...(code.nfCoreModule ? { reference: code.nfCoreModule.id } : code.processSource.trim() ? { code: code.processSource } : {}),
      };
      const context: DawExecutionContext = {};
      const container = containerIn(code.processSource);
      if (container) context.container = container;
      if (code.configBlocks.length > 0) {
        context.config = code.configBlocks;
        context.engine = "nextflow";
      }
      if (Object.keys(context).length > 0) task.executionContext = context;
    }
  }
  task.nwave = nwaveNode(node, index);
  return task;
};

const storageOf = (node: Node<NodeData>, type: DawStorage["type"], index: number): DawStorage => {
  const data = node.data as Record<string, unknown>;
  const storage: DawStorage = { id: node.id, name: labelOf(node), type };
  const inputs = portsOf(node, "inputs");
  const outputs = portsOf(node, "outputs");
  if (inputs.length > 0) storage.inputs = inputs;
  if (outputs.length > 0) storage.outputs = outputs;
  if (node.type === "fileInput" && Array.isArray(data.files)) {
    storage.files = (data.files as Array<{ name?: string; originalName?: string }>).map((file) => String(file.name || file.originalName || ""));
  }
  if (node.type === "samplesheet" && typeof data.samplesheetFileName === "string") storage.files = [data.samplesheetFileName];
  if (node.type === "parameters") {
    storage.values = getNodeParameters(data).map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
      value: String(parameter.value ?? ""),
    }));
  }
  storage.nwave = nwaveNode(node, index);
  return storage;
};

const emptyDaw = (id: string, name: string): Daw => ({ id, name, tasks: [], storages: [], interconnections: [], daws: [] });

export const toDawModel = ({ nodes, edges, workflowName, description, settings }: DawModelSource): DawModelFile => {
  const root = emptyDaw("daw", workflowName || "Workflow");
  if (description) root.description = description;
  root.executionContext = { engine: "nextflow" };

  // Each group (#221) is a sub-DAW; its steps are its Tasks.
  const groupDaws = new Map<string, Daw>();
  const dawOfNode = new Map<string, Daw>();
  for (const [group, members] of groupsOf(nodes)) {
    const sub = emptyDaw(`group:${group}`, groupTitle(group));
    groupDaws.set(group, sub);
    for (const member of members) dawOfNode.set(member.id, sub);
  }

  const notes: NwaveNode[] = [];
  const valuePorts = new Set<string>();
  nodes.forEach((node, index) => {
    const kind = classifyNode(node);
    const home = dawOfNode.get(node.id) ?? root;
    if (kind.kind === "note") {
      notes.push({ ...nwaveNode(node, index) });
    } else if (kind.kind === "task") {
      home.tasks.push(taskOf(node, kind.type, index));
    } else if (kind.kind === "storage") {
      home.storages.push(storageOf(node, kind.type, index));
      if (node.type === "parameters") {
        for (const parameter of getNodeParameters(node.data as Record<string, unknown>)) {
          if (parameter.type !== "file") valuePorts.add(`${node.id}|${parameter.name}`);
        }
      }
    } else {
      const sub = emptyDaw(node.id, labelOf(node));
      sub.reference = kind.reference;
      const inputs = portsOf(node, "inputs");
      const outputs = portsOf(node, "outputs");
      if (inputs.length > 0) sub.inputs = inputs;
      if (outputs.length > 0) sub.outputs = outputs;
      sub.nwave = nwaveNode(node, index);
      home.daws.push(sub);
    }
  });
  for (const sub of groupDaws.values()) root.daws.push(sub);

  // A connection belongs to the DAW both its ends are in, else to the workflow.
  edges.forEach((edge, index) => {
    const interconnection: DawInterconnection = {
      id: `interconnection-${index + 1}`,
      // A parameter's value arrives once; everything else is a channel.
      type: valuePorts.has(`${edge.source}|${edge.sourceHandle ?? ""}`) ? "SimpleSendDataInterconnection" : "StreamingInterconnection",
      from: { element: edge.source, ...(edge.sourceHandle ? { port: edge.sourceHandle } : {}) },
      to: { element: edge.target, ...(edge.targetHandle ? { port: edge.targetHandle } : {}) },
      nwave: { index, ...(edge.data && Object.keys(edge.data).length > 0 ? { data: plain(edge.data as Record<string, unknown>) } : {}) },
    };
    const from = dawOfNode.get(edge.source);
    (from && from === dawOfNode.get(edge.target) ? from : root).interconnections.push(interconnection);
  });

  // Run profiles name clusters, queues and accounts: not part of a model to share.
  const { runProfiles: _runProfiles, runProfile: _runProfile, ...shared } = settings ?? {};
  const extension: NonNullable<DawModelFile["nwave"]> = {};
  if (notes.length > 0) extension.notes = notes;
  if (Object.keys(shared).length > 0) extension.executionSettings = plain(shared);

  return {
    schema: DAW_SCHEMA,
    metamodel: DAW_METAMODEL,
    generator: { name: "N-WAVE" },
    daw: root,
    ...(Object.keys(extension).length > 0 ? { nwave: extension } : {}),
  };
};

/** The model as the file N-WAVE writes: the same text for the same workflow. */
export const serializeDawModel = (model: DawModelFile): string => `${JSON.stringify(model, null, 2)}\n`;

/** The model as another tool would write it: the metamodel's elements only, without N-WAVE's own data. */
export const withoutNwaveData = (model: DawModelFile): DawModelFile => {
  const strip = (daw: Daw): Daw => {
    const { nwave: _nwave, ...rest } = daw;
    return {
      ...rest,
      tasks: daw.tasks.map(({ nwave: _node, ...task }) => task),
      storages: daw.storages.map(({ nwave: _node, ...storage }) => storage),
      interconnections: daw.interconnections.map(({ nwave: _edge, ...interconnection }) => interconnection),
      daws: daw.daws.map(strip),
    };
  };
  const { nwave: _extension, ...file } = model;
  return { ...file, daw: strip(model.daw) };
};
