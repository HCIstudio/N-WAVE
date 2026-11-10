// A DAW model (dawModel.ts) as a canvas.
//
// A model N-WAVE wrote carries each node in `nwave`: the canvas comes back as
// it was. A model from another tool (or an abstract workflow, written before
// its steps are implemented) has the metamodel's elements only, and opens as
// a skeleton:
//
//   Task with Nextflow process code        a step that keeps the code
//   Task referring to an nf-core module    the nf-core node (from the catalog)
//   InlineDescription, SkipTask, Monitor
//   … with Nextflow code                   channel code
//   any other Task, a sub-DAW by reference a placeholder step to fill in
//   a sub-DAW with its parts               its steps, as a group
//   Storage with values                    Parameters
//   Storage data comes from                File Input
//   Storage data goes to                   Display Output
//   Interconnection                        a connection

import type { Edge, Node } from "@xyflow/react";
import type { NodeData, PortData } from "../components/nodes/BaseNode";
import { lowerSnake, upperSnake } from "../generators/core/naming";
import { groupName } from "../groups/groups";
import {
  createNodeDefinitionFromCustomNode,
  createStoredCustomNode,
  EMBEDDED_DATES,
  parseCustomNodeSource,
  type StoredCustomNode,
} from "../registry/customNodes";
import { buildNfCoreManifest, type NfCoreCatalogEntryForManifest } from "../registry/nfcore/manifest";
import {
  buildNfCoreSubworkflowManifest,
  createNodeDefinitionFromNfCoreSubworkflowManifest,
  type NfCoreSubworkflowCatalogEntry,
} from "../registry/nfcore/subworkflow";
import { createNodeDefinitionFromNfCoreManifest } from "../registry/nfcoreModuleAdapters";
import { type NodeDefinition, nodeDefinitions } from "../registry/nodeDefinitions";
import { autoLayout } from "../workflows/import/autoLayout";
import { isPlaceholder, PLACEHOLDER_MARKER } from "./placeholder";
import type { Daw, DawInterconnection, DawModelFile, DawPort, DawStorage, DawTask, NwaveNode } from "./dawModel";

/** The node types the canvas has: a model can't bring others. */
const NODE_TYPES = new Set([
  "fileInput",
  "samplesheet",
  "parameters",
  "channelOperator",
  "pipeline",
  "note",
  "outputDisplay",
  "filter",
  "operator",
  "process",
]);

export interface DawCatalog {
  modules?: NfCoreCatalogEntryForManifest[];
  subworkflows?: NfCoreSubworkflowCatalogEntry[];
}

export interface CanvasFromDawModel {
  name: string;
  description: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  /** nf-core nodes the canvas uses, to register. */
  definitions: NodeDefinition[];
  /** The workflow's run settings, when the model has them. */
  executionSettings: Record<string, unknown> | null;
  warnings: string[];
}

const defaultsOf = (id: string): Partial<NodeData> =>
  JSON.parse(JSON.stringify(nodeDefinitions.find((candidate) => candidate.id === id)?.defaults ?? {}));

const identifier = (text: string, fallback: string): string => {
  const name = lowerSnake(text);
  return name ? (/^[0-9]/.test(name) ? `p_${name}` : name) : fallback;
};

const port = (name: string, label?: string): PortData => ({ name, label: label ?? name, isConnectable: true });

/** A process that says what is missing: the placeholder of a task without an implementation. */
export const placeholderProcess = (processName: string, title: string, inputs: string[], outputs: string[], description: string): string =>
  [
    `process ${processName} {`,
    ...(description ? description.split("\n").map((line) => `    // ${line}`) : []),
    "    // To do: this step has no implementation yet. Write its script, or replace it with a node from the library.",
    ...(inputs.length > 0 ? ["    input:", ...inputs.map((name) => `    path ${name}`), ""] : []),
    ...(outputs.length > 0 ? ["    output:", ...outputs.map((name) => `    path '${name}.*', emit: ${name}`), ""] : []),
    "    script:",
    '    """',
    `    echo "${title.replace(/["\\$`]/g, "")} ${PLACEHOLDER_MARKER}" >&2`,
    "    exit 1",
    '    """',
    "}",
  ].join("\n");

export const fromDawModel = (model: DawModelFile, catalog: DawCatalog | null = null): CanvasFromDawModel => {
  const warnings: string[] = [];
  const definitions = new Map<string, NodeDefinition>();
  const made: Array<{ node: Node<NodeData>; index: number; placed: boolean }> = [];
  /** How each element's ports are called on its node (a skeleton's ports are named for the code). */
  const portNames = new Map<string, { inputs: Map<string, string>; outputs: Map<string, string>; firstInput?: string; firstOutput?: string }>();

  // Every connection, to know which ports and directions the elements have.
  const interconnections: DawInterconnection[] = [];
  const collect = (daw: Daw) => {
    interconnections.push(...daw.interconnections);
    daw.daws.forEach(collect);
  };
  collect(model.daw);
  const outgoing = (id: string) => interconnections.filter((interconnection) => interconnection.from.element === id);
  const incoming = (id: string) => interconnections.filter((interconnection) => interconnection.to.element === id);

  const takenProcessNames = new Set<string>();
  const processNameFor = (name: string): string => {
    const base = upperSnake(name) || "STEP";
    const start = /^[0-9]/.test(base) ? `STEP_${base}` : base;
    let unique = start;
    for (let count = 2; takenProcessNames.has(unique); count += 1) unique = `${start}_${count}`;
    takenProcessNames.add(unique);
    return unique;
  };

  let order = 0;
  const add = (id: string, type: string, data: Partial<NodeData>, label: string, nwave?: NwaveNode) => {
    order += 1;
    made.push({
      node: { id, type, position: nwave?.position ?? { x: 0, y: 0 }, data: { ...data, label } as NodeData },
      index: nwave?.index ?? 1_000_000 + order,
      placed: Boolean(nwave),
    });
  };
  const namePorts = (id: string, inputs: PortData[], outputs: PortData[], declared: { inputs?: DawPort[]; outputs?: DawPort[] }) => {
    const byPosition = (ports: PortData[], given: DawPort[] | undefined) => {
      const names = new Map(ports.map((entry) => [String(entry.name), String(entry.name)]));
      (given ?? []).forEach((entry, index) => {
        if (!names.has(entry.name) && ports[index]) names.set(entry.name, String(ports[index].name));
      });
      return names;
    };
    portNames.set(id, {
      inputs: byPosition(inputs, declared.inputs),
      outputs: byPosition(outputs, declared.outputs),
      firstInput: inputs[0] ? String(inputs[0].name) : undefined,
      firstOutput: outputs[0] ? String(outputs[0].name) : undefined,
    });
  };

  /** N-WAVE's own node, when the element carries one the canvas has. */
  const restore = (id: string, nwave: NwaveNode | undefined, group: string | null): boolean => {
    if (!nwave) return false;
    if (!NODE_TYPES.has(nwave.type)) {
      warnings.push(`“${id}” is a node of the type “${nwave.type}”, which this version of N-WAVE doesn't have; it opens as a placeholder.`);
      return false;
    }
    const data = JSON.parse(JSON.stringify(nwave.data)) as Record<string, unknown>;
    // Its own group, when it has one; else the sub-DAW it is in.
    if (group && typeof data.group !== "string") data.group = group;
    order += 1;
    made.push({ node: { id, type: nwave.type, position: { ...nwave.position }, data: data as NodeData }, index: nwave.index, placed: true });
    return true;
  };

  /** The ports an element needs: those it declares, and those its connections name. */
  const neededPorts = (id: string, declared: { inputs?: DawPort[]; outputs?: DawPort[] }) => {
    const unique = (names: string[]) => [...new Set(names)];
    const inputs = unique([...(declared.inputs ?? []).map((entry) => entry.name), ...incoming(id).flatMap((entry) => (entry.to.port ? [entry.to.port] : []))]);
    const outputs = unique([...(declared.outputs ?? []).map((entry) => entry.name), ...outgoing(id).flatMap((entry) => (entry.from.port ? [entry.from.port] : []))]);
    if (inputs.length === 0 && incoming(id).length > 0) inputs.push("in");
    if (outputs.length === 0 && outgoing(id).length > 0) outputs.push("out");
    return { inputs, outputs };
  };

  const embedded = (name: string, source: string, description: string, extra: Partial<NodeData> = {}): Partial<NodeData> => {
    const parsed = parseCustomNodeSource(source);
    const stored = createStoredCustomNode({ label: name, description, icon: "Code", source }, parsed, {
      inputs: parsed.inputs,
      outputs: parsed.outputs,
    });
    const key = (source.match(/^\s*process\s+([A-Za-z_]\w*)/m)?.[1] ?? name).toLowerCase();
    const local: StoredCustomNode = { ...stored, id: `local-${key}`, processType: `local_${key}`, ...EMBEDDED_DATES };
    return { ...JSON.parse(JSON.stringify(createNodeDefinitionFromCustomNode(local).defaults)), ...extra };
  };

  const placeholder = (
    id: string,
    name: string,
    description: string,
    declared: { inputs?: DawPort[]; outputs?: DawPort[] },
    group: string | null,
    subtitle: string,
  ) => {
    const needed = neededPorts(id, declared);
    const taken = new Set<string>();
    const renamed = (names: string[], fallback: string) =>
      new Map(
        names.map((original, index) => {
          const base = identifier(original, `${fallback}${index + 1}`);
          let unique = base;
          for (let count = 2; taken.has(unique); count += 1) unique = `${base}_${count}`;
          taken.add(unique);
          return [original, unique];
        }),
      );
    const inputs = renamed(needed.inputs, "in");
    const outputs = renamed(needed.outputs, "out");
    const processName = processNameFor(name);
    const data = embedded(name, placeholderProcess(processName, name, [...inputs.values()], [...outputs.values()], description), description, {
      placeholder: true,
      subtitle,
      ...(group ? { group } : {}),
    });
    add(id, "process", data, name);
    portNames.set(id, {
      inputs,
      outputs,
      firstInput: [...inputs.values()][0],
      firstOutput: [...outputs.values()][0],
    });
  };

  const nfCoreNode = (reference: string): NodeDefinition | null => {
    const subworkflow = catalog?.subworkflows?.find((entry) => entry.id === reference);
    const module = catalog?.modules?.find((entry) => entry.id === reference);
    if (!subworkflow && !module) return null;
    const definition = subworkflow
      ? createNodeDefinitionFromNfCoreSubworkflowManifest(buildNfCoreSubworkflowManifest(subworkflow))
      : createNodeDefinitionFromNfCoreManifest(buildNfCoreManifest(module as NfCoreCatalogEntryForManifest));
    definitions.set(definition.id, definition);
    return definition;
  };
  const addNfCore = (id: string, name: string, definition: NodeDefinition, declared: { inputs?: DawPort[]; outputs?: DawPort[] }, group: string | null) => {
    const data = { ...JSON.parse(JSON.stringify(definition.defaults ?? {})), icon: definition.icon, ...(group ? { group } : {}) } as Partial<NodeData>;
    add(id, definition.type, data, name || definition.label);
    namePorts(id, (data.inputs ?? definition.inputs ?? []) as PortData[], (data.outputs ?? definition.outputs ?? []) as PortData[], declared);
  };

  const addTask = (task: DawTask, group: string | null) => {
    if (restore(task.id, task.nwave, group)) return;
    const description = task.description ?? "";
    const code = task.implementation?.code ?? "";
    const isNextflow = /^(nextflow|groovy)$/i.test(task.implementation?.language ?? "");
    const reference = task.implementation?.reference ?? "";
    const library = reference ? nfCoreNode(reference) : null;
    if (library) {
      addNfCore(task.id, task.name, library, task, group);
      return;
    }
    if (reference && !code) warnings.push(`“${task.name}” refers to “${reference}”, which isn't in the nf-core catalog; it opens as a placeholder.`);
    if (isNextflow && /^\s*process\s+[A-Za-z_]\w*\s*\{/m.test(code)) {
      const data = embedded(task.name, code, description || "Imported from a DAW model.", group ? { group } : {});
      add(task.id, "process", data, task.name);
      namePorts(task.id, (data.inputs ?? []) as PortData[], (data.outputs ?? []) as PortData[], task);
      return;
    }
    if (isNextflow && code.trim() && task.type !== "Executable" && task.type !== "Task") {
      const needed = neededPorts(task.id, task);
      const inputs = needed.inputs.map((name) => port(name));
      const outputs = needed.outputs.map((name) => port(name));
      add(
        task.id,
        "channelOperator",
        { ...defaultsOf("channelOperator"), subtitle: "Channel code", channelOperatorTemplate: "custom", channelOperatorCode: code, inputs, outputs, ...(group ? { group } : {}) },
        task.name,
      );
      namePorts(task.id, inputs, outputs, task);
      return;
    }
    placeholder(task.id, task.name, description, task, group, "To do: no implementation yet");
  };

  const addStorage = (storage: DawStorage) => {
    if (restore(storage.id, storage.nwave, null)) return;
    const reads = incoming(storage.id).length > 0;
    const feeds = outgoing(storage.id).length > 0;
    if (storage.values && storage.values.length > 0) {
      const parameters = storage.values.map((value) => ({
        name: identifier(value.name, "param"),
        type: ["text", "number", "boolean", "file"].includes(value.type) ? value.type : "text",
        value: value.value,
      }));
      const outputs = parameters.filter((parameter) => parameter.type === "file").map((parameter) => port(parameter.name));
      add(
        storage.id,
        "parameters",
        { ...defaultsOf("parameters"), subtitle: `${parameters.length} parameter${parameters.length === 1 ? "" : "s"}`, parameters, outputs } as Partial<NodeData>,
        storage.name,
      );
      namePorts(storage.id, [], outputs, storage);
      return;
    }
    if (reads && feeds) {
      // Data kept between steps: a step of its own on the canvas, to fill in or remove.
      placeholder(storage.id, storage.name, storage.description ?? "", storage, null, `${storage.type}: to do`);
      return;
    }
    if (reads) {
      const data = defaultsOf("outputDisplay");
      add(storage.id, "outputDisplay", data, storage.name);
      namePorts(storage.id, (data.inputs ?? []) as PortData[], [], storage);
      return;
    }
    const data = { ...defaultsOf("fileInput"), files: [], subtitle: "No file yet" } as Partial<NodeData>;
    add(storage.id, "fileInput", data, storage.name);
    namePorts(storage.id, [], (data.outputs ?? []) as PortData[], storage);
    if (storage.files && storage.files.length > 0) {
      warnings.push(`“${storage.name}” holds ${storage.files.join(", ")}; the model doesn't have the file${storage.files.length === 1 ? "" : "s"}, upload ${storage.files.length === 1 ? "it" : "them"} to the node.`);
    }
  };

  const takenGroups = new Set<string>();
  const addDaw = (daw: Daw, group: string | null, top: boolean) => {
    if (!top) {
      const hasParts = daw.tasks.length + daw.storages.length + daw.daws.length > 0;
      if (!hasParts) {
        // A DAW defined elsewhere: one node.
        if (restore(daw.id, daw.nwave, group)) return;
        const library = daw.reference ? nfCoreNode(daw.reference) : null;
        if (library) addNfCore(daw.id, daw.name, library, daw, group);
        else placeholder(daw.id, daw.name, daw.description ?? "", daw, group, daw.reference ? `Sub-workflow ${daw.reference}: to do` : "Sub-workflow: to do");
        return;
      }
      // A sub-DAW with its parts: a group of steps (the innermost one names it).
      const base = groupName(daw.name) || "GROUP";
      let name = base;
      for (let count = 2; takenGroups.has(name); count += 1) name = `${base}_${count}`;
      takenGroups.add(name);
      group = name;
    }
    for (const task of daw.tasks) addTask(task, group);
    for (const storage of daw.storages) addStorage(storage);
    for (const sub of daw.daws) addDaw(sub, group, false);
  };
  addDaw(model.daw, null, true);

  for (const note of model.nwave?.notes ?? []) {
    if (note.type !== "note") continue;
    order += 1;
    made.push({
      node: { id: `nwave-note-${order}`, type: "note", position: { ...note.position }, data: JSON.parse(JSON.stringify(note.data)) as NodeData },
      index: note.index,
      placed: true,
    });
  }

  made.sort((left, right) => left.index - right.index);
  const nodes = made.map((entry) => entry.node);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  // The connections, in N-WAVE's order when the model has it.
  const ordered = interconnections
    .map((interconnection, position) => ({ interconnection, position }))
    .sort((left, right) => (left.interconnection.nwave?.index ?? 1_000_000 + left.position) - (right.interconnection.nwave?.index ?? 1_000_000 + right.position));
  const edges: Edge[] = [];
  const seen = new Set<string>();
  for (const { interconnection } of ordered) {
    const source = byId.get(interconnection.from.element);
    const target = byId.get(interconnection.to.element);
    if (!source || !target) {
      warnings.push(`A connection from “${interconnection.from.element}” to “${interconnection.to.element}” was left out: one of them is a group, which the canvas connects through its steps.`);
      continue;
    }
    const sourcePorts = portNames.get(source.id);
    const targetPorts = portNames.get(target.id);
    const sourceHandle = sourcePorts
      ? (sourcePorts.outputs.get(interconnection.from.port ?? "") ?? sourcePorts.firstOutput)
      : interconnection.from.port;
    const targetHandle = targetPorts
      ? (targetPorts.inputs.get(interconnection.to.port ?? "") ?? targetPorts.firstInput)
      : interconnection.to.port;
    if (!sourceHandle || !targetHandle) {
      warnings.push(`The connection from “${String(source.data.label)}” to “${String(target.data.label)}” was left out: ${!sourceHandle ? "the first has no output" : "the second has no input"} on the canvas.`);
      continue;
    }
    const key = `${source.id}.${sourceHandle}->${target.id}.${targetHandle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: `e-${source.id}.${sourceHandle}-${target.id}.${targetHandle}-${edges.length}`,
      source: source.id,
      sourceHandle,
      target: target.id,
      targetHandle,
      ...(interconnection.nwave?.data ? { data: JSON.parse(JSON.stringify(interconnection.nwave.data)) } : {}),
    });
  }

  // Elements without a place on the canvas are laid out; the others stay.
  if (made.some((entry) => !entry.placed)) {
    autoLayout(nodes, edges, new Set(made.filter((entry) => entry.placed).map((entry) => entry.node.id)));
  }

  const placeholders = nodes.filter(isPlaceholder).length;
  if (placeholders > 0) {
    warnings.unshift(
      `${placeholders} step${placeholders === 1 ? " has" : "s have"} no implementation in the model and ${placeholders === 1 ? "is a placeholder" : "are placeholders"}: write ${placeholders === 1 ? "its" : "their"} code, or replace ${placeholders === 1 ? "it" : "them"} with nodes from the library.`,
    );
  }

  return {
    name: model.daw.name,
    description: model.daw.description ?? "",
    nodes,
    edges,
    definitions: [...definitions.values()],
    executionSettings: model.nwave?.executionSettings ?? null,
    warnings,
  };
};
