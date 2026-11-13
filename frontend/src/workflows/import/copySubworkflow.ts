// "Copy into new workflow": an nf-core subworkflow's main.nf as a workflow
// of its own, to change what's inside. Its steps come from the script
// importer (modules and subworkflows as nf-core nodes, channel code as
// channel operators); its inputs (take:) become input nodes and its outputs
// (emit:) Display Output nodes.

import { FILE_INPUT_OUTPUT } from "../../utils/inputFiles";
import type { Edge, Node } from "@xyflow/react";
import type { NodeData, PortData } from "../../components/nodes/BaseNode";
import type { NfCoreSubworkflowCatalogEntry } from "../../registry/nfcore/subworkflow";
import { nodeDefinitions } from "../../registry/nodeDefinitions";
import type { WorkflowParameter } from "../../registry/params";
import { autoLayoutBranches } from "./autoLayout";
import { importNextflowScript, type ImportedCanvas, type NfCoreCatalogForImport } from "./importScript";
import { blockBody, maskSource, topLevelItems, workflowSections } from "./nextflowSource";

type Take = NfCoreSubworkflowCatalogEntry["takes"][number];

/** How a take comes into the copy. */
type InputKind = "samplesheet" | "reference" | "files" | "value";

/** Read-like takes are a samplesheet, references parameters, other files a File Input. */
const inputKind = (take: Take): InputKind => {
  if (take.kind === "value") return "value";
  const text = `${take.name} ${take.description ?? ""}`;
  if (/fastq|\breads\b/i.test(text)) return "samplesheet";
  if (/reference|genome|index|fasta|gtf|gff|\bbed\b|transcriptome|splice|dict|annotation|meta2/i.test(text)) return "reference";
  return "files";
};

/** The files a take carries, from its structure (`[ val(meta), path(fasta), path(fai) ]`). */
const filesOf = (take: Take): string[] => {
  const structure = (take.description ?? "").match(/Structure:\s*\[(.*)\]/)?.[1] ?? "";
  const paths = [...structure.matchAll(/path\(\s*([A-Za-z_]\w*)\s*\)/g)].map((match) => match[1]);
  return paths.length > 0 ? paths : [take.name.replace(/^ch_/, "")];
};

const title = (name: string): string =>
  name
    .replace(/^ch_/, "")
    .split("_")
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

/** A node as the "Add node" menu makes it. */
const newNode = (definitionId: string, id: string, data: Partial<NodeData>): Node<NodeData> => {
  const definition = nodeDefinitions.find((entry) => entry.id === definitionId);
  return {
    id,
    type: definition?.type ?? definitionId,
    position: { x: 0, y: 0 },
    data: { label: definition?.label, icon: definition?.icon, ...JSON.parse(JSON.stringify(definition?.defaults ?? {})), ...data } as NodeData,
  };
};

/** `name` in code, not after a dot, as a field name or in a string. */
const replaceName = (code: string, name: string, replacement: string): string => {
  const masked = maskSource(code, { keepInterpolations: true });
  const pattern = new RegExp(`(?<![.\\w$])${name}(?![\\w])(?!\\s*:(?!:))`, "g");
  let result = "";
  let last = 0;
  for (const match of masked.matchAll(pattern)) {
    const at = match.index ?? 0;
    result += code.slice(last, at) + replacement;
    last = at + name.length;
  }
  return result + code.slice(last);
};

export interface CopiedSubworkflow extends ImportedCanvas {
  name: string;
}

/**
 * A subworkflow's main.nf as a workflow: the steps it calls, connected as it
 * connects them, with input nodes for its takes and Display Output nodes for
 * its emits. What can't be copied is in the warnings.
 */
export const copySubworkflow = (
  source: string,
  entry: Pick<NfCoreSubworkflowCatalogEntry, "id" | "takes" | "emits"> & { workflowName?: string },
  catalog: NfCoreCatalogForImport,
): CopiedSubworkflow => {
  const items = topLevelItems(source);
  const workflow =
    items.find((item) => item.kind === "workflow" && item.name && item.name === entry.workflowName) ??
    items.filter((item) => item.kind === "workflow" && item.name).pop();
  if (!workflow) throw new Error("The subworkflow's main.nf has no named workflow to copy.");
  const sections = workflowSections(blockBody(workflow.text));
  const takeNames = sections.take
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => /^[A-Za-z_]\w*$/.test(line));
  const takes: Take[] = takeNames.map(
    (name) => entry.takes.find((take) => take.name === name) ?? ({ name, kind: "channel", type: "expression", description: "", defaultValue: "" } as Take),
  );

  // The workflow body as an entry workflow: value takes are parameters,
  // each channel take a placeholder channel (swapped for an input node below).
  let main = sections.main;
  const valueTakes = takes.filter((candidate) => candidate.kind === "value");
  for (const take of valueTakes) main = replaceName(main, take.name, `params.${take.name}`);
  const channelTakes = takes.filter((take) => take.kind !== "value");
  const placeholders = channelTakes.map((take) => `// take: ${take.name}\n${take.name} = channel.empty()`);

  // Emits that read more than a step's output or a variable become channel code to read from.
  const emits = sections.emit
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .map((line) => line.match(/^([A-Za-z_]\w*)\s*(?:=\s*(.+))?$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ name: match[1], expression: (match[2] ?? match[1]).trim() }))
    .filter((emit) => emit.name !== "versions");
  const simple = (expression: string) => /^[A-Za-z_]\w*(\.out(\.[A-Za-z_]\w*|\[\d+\])?)?$/.test(expression);
  const emitCode = emits
    .filter((emit) => !simple(emit.expression))
    .map((emit) => `// emit: ${emit.name}\nemit_${emit.name} = ${emit.expression}`);

  // Includes from the project's root: `../../../modules/nf-core/x` is `./modules/nf-core/x`.
  const folder = `subworkflows/nf-core/${entry.id.replace(/^nf-core\/subworkflows\//, "")}`;
  const fromRoot = (path: string) => {
    if (!path.startsWith(".")) return path;
    const parts = folder.split("/");
    for (const part of path.split("/")) {
      if (part === "..") parts.pop();
      else if (part !== "." && part !== "") parts.push(part);
    }
    return `./${parts.join("/")}`;
  };
  const outside = items
    .filter((item) => item !== workflow && item.kind !== "workflow")
    .map((item) => {
      const text = item.kind === "include" ? item.text.replace(/(from\s*['"])([^'"]+)(['"])/, (_all, open: string, path: string, close: string) => `${open}${fromRoot(path)}${close}`) : item.text;
      return [...item.comments, text].join("\n");
    });
  const script = [
    ...outside,
    `workflow {\n${[...placeholders, main.trim(), ...emitCode].join("\n\n")}\n}`,
  ].join("\n\n");

  const imported = importNextflowScript(script, { catalog });
  const nodes = imported.nodes;
  let edges = imported.edges;
  const warnings = [...imported.warnings];

  /** The node port a reference reads: `STEP.out.bam`, `STEP.out`, a variable. */
  const portOf = (reference: string): { nodeId: string; port: string } | null => {
    const output = reference.match(/^([A-Za-z_]\w*)\.out(?:\.([A-Za-z_]\w*)|\[(\d+)\])?$/);
    if (output) {
      const step = nodes.find((node) => node.data.scriptName === output[1] || node.data.label === output[1]);
      const ports = (step?.data.outputs ?? []) as PortData[];
      const port = output[2] ? ports.find((candidate) => candidate.name === output[2]) : ports[Number(output[3] ?? 0)];
      return step && port ? { nodeId: step.id, port: port.name } : null;
    }
    for (const node of nodes) {
      const names = (node.data.channelNames ?? {}) as Record<string, string>;
      const port = Object.keys(names).find((key) => names[key] === reference);
      if (port) return { nodeId: node.id, port };
      if (node.data.scriptAssigned === reference) {
        const first = (node.data.outputs as PortData[] | undefined)?.[0]?.name;
        if (first) return { nodeId: node.id, port: first };
      }
    }
    return null;
  };

  // Outputs: a Display Output for each emit (from each arm, for a channel a branch sets).
  for (const emit of emits) {
    const reference = simple(emit.expression) ? emit.expression : `emit_${emit.name}`;
    const single = portOf(reference);
    const from = single ? [single] : (imported.channels[reference] ?? []);
    const display = newNode("outputDisplay", `copy-output-${emit.name}`, { label: `${title(emit.name)} output`, subtitle: `emit: ${emit.name}` });
    nodes.push(display);
    if (from.length > 0) {
      for (const source of from) {
        edges.push({
          id: `e-${source.nodeId}.${source.port}-${display.id}.in`,
          source: source.nodeId,
          sourceHandle: source.port,
          target: display.id,
          targetHandle: "in",
          ...("data" in source && source.data ? { data: source.data as Record<string, unknown> } : {}),
        });
      }
    } else {
      warnings.push(`The output ${emit.name} (${emit.expression}) couldn't be traced to a step; connect its Display Output by hand.`);
    }
  }

  // Inputs: the placeholders' connections go to input nodes instead.
  // Value takes, at their defaults; reference files (set below) next to them.
  const references: WorkflowParameter[] = valueTakes.map((take) => ({
    name: take.name,
    type: take.type === "boolean" ? "boolean" : take.type === "integer" || take.type === "float" ? "number" : "text",
    value: take.defaultValue === null || take.defaultValue === undefined ? "" : String(take.defaultValue),
    description: take.description,
  }));
  const replacements = new Map<string, { nodeId: string; ports: string[] }>();
  for (const take of channelTakes) {
    const kind = inputKind(take);
    if (kind === "reference") {
      const files = filesOf(take).map((file) => (hasReference(references, file) ? `${take.name.replace(/^ch_/, "")}_${file}` : file));
      for (const file of files) references.push({ name: file, type: "file", value: "", description: take.description });
      replacements.set(take.name, { nodeId: "copy-parameters", ports: files });
      continue;
    }
    const id = `copy-input-${take.name}`;
    nodes.push(
      kind === "samplesheet"
        ? newNode("samplesheet", id, { label: title(take.name), subtitle: "Upload a samplesheet" })
        : newNode("fileInput", id, { label: title(take.name), subtitle: "No files yet" }),
    );
    replacements.set(take.name, { nodeId: id, ports: [kind === "samplesheet" ? "samples" : FILE_INPUT_OUTPUT] });
    if (kind === "files" && filesOf(take).length > 1) {
      warnings.push(`${take.name} takes several files per item (${filesOf(take).join(", ")}); its File Input gives one.`);
    }
  }
  if (references.length > 0) {
    nodes.push(
      newNode("parameters", "copy-parameters", {
        label: "Parameters",
        parameters: references,
        subtitle: `${references.length} parameter${references.length === 1 ? "" : "s"}`,
        outputs: references
          .filter((reference) => reference.type === "file")
          .map((reference) => ({ name: reference.name, label: reference.name, isConnectable: true })),
      }),
    );
  }

  const isModule = (node: Node<NodeData> | undefined) =>
    typeof node?.data.nwaveNfCoreModuleId === "string" && !node.data.nwaveNfCoreModuleId.includes("subworkflows");
  for (const take of channelTakes) {
    const placeholder = nodes.find((node) => node.type === "channelOperator" && node.data.channelOperatorCode === `output.${take.name} = channel.empty()`);
    const replacement = replacements.get(take.name);
    if (!placeholder || !replacement) continue;
    const { nodeId, ports } = replacement;
    const rewired: Edge[] = [];
    // Consumers that take the files as one tuple read it from the placeholder, made into code that builds it.
    let builds = false;
    for (const edge of edges) {
      if (edge.source !== placeholder.id) {
        rewired.push(edge);
        continue;
      }
      const target = nodes.find((node) => node.id === edge.target);
      if (ports.length > 1 && !isModule(target)) {
        builds = true;
        rewired.push(edge);
        continue;
      }
      // A module's tuple input takes the files port by port.
      const targetPorts = ((target?.data.inputs ?? []) as PortData[]).map((port) => port.name);
      const at = targetPorts.indexOf(String(edge.targetHandle));
      ports.forEach((port, index) => {
        const targetHandle = index === 0 ? edge.targetHandle : targetPorts[at + index];
        if (targetHandle) rewired.push({ ...edge, id: `${edge.id}-${index}`, source: nodeId, sourceHandle: port, targetHandle });
      });
    }
    edges = rewired;
    if (!builds) {
      nodes.splice(nodes.indexOf(placeholder), 1);
      continue;
    }
    // `[ meta, fasta, fai ]` from the files.
    const first = ports[0];
    placeholder.data = {
      ...placeholder.data,
      label: title(take.name),
      subtitle: `[ meta, ${ports.join(", ")} ]`,
      channelOperatorCode: `output.${take.name} = ${ports.map((port, index) => (index === 0 ? `input.${port}` : `.combine(input.${port})`)).join("")}\n    .map { ${ports.join(", ")} -> [ [id: ${first}.baseName], ${ports.join(", ")} ] }`,
      inputs: ports.map((port) => ({ name: port, label: port, isConnectable: true })),
    };
    for (const port of ports) {
      edges.push({ id: `e-${nodeId}.${port}-${placeholder.id}.${port}`, source: nodeId, sourceHandle: port, target: placeholder.id, targetHandle: port });
    }
  }

  warnings.push(
    "Settings nf-core pipelines give these steps in their modules.config (ext.args, ext.prefix) aren't part of the subworkflow; set them on each step.",
  );
  autoLayoutBranches(nodes, edges);
  return {
    name: `${workflow.name} (copy)`,
    nodes,
    edges,
    definitions: imported.definitions,
    warnings: [...new Set(warnings)],
    channels: imported.channels,
  };
};

const hasReference = (references: WorkflowParameter[], name: string) => references.some((reference) => reference.name === name);
