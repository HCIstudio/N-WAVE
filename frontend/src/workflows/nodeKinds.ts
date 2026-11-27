// What a node is, at a glance: where data enters the workflow (inputs), a
// step from nf-core, a step written by hand (custom), a step N-WAVE writes on
// the contents of text files (text), an operator that reshapes channels
// between steps, or where results come out (outputs). The
// workflow previews and the canvas show these kinds with the same colors and
// shapes, explained by the same legend; the shapes tell them apart without
// color too.

export type NodeKind = "input" | "nfcore" | "custom" | "text" | "operator" | "logic" | "output";

const INPUT_TYPES = new Set(["fileInput", "samplesheet", "parameters"]);
/** Channel code: Channel Operator nodes and channel code kept from an import. */
const OPERATOR_TYPES = new Set(["operator", "channelOperator"]);
/** Filter lines, Change text and Join files: steps on the contents of text files (operator nodes by type; old filters had their own type). */
const TEXT_OPERATORS = new Set(["filter", "map", "merge"]);

/** The kind of a node; notes have none. */
export const nodeKindOf = (node: {
  type?: string;
  data?: Record<string, unknown>;
}): NodeKind | null => {
  if (node.type === "note") return null;
  if (INPUT_TYPES.has(node.type ?? "")) return "input";
  if (node.type === "outputDisplay") return "output";
  if (node.type === "pipeline" || String(node.data?.processType ?? "").startsWith("nfcore")) {
    return "nfcore";
  }
  if (node.type === "filter" || (node.type === "operator" && TEXT_OPERATORS.has(String(node.data?.operatorType ?? "")))) return "text";
  if (OPERATOR_TYPES.has(node.type ?? "")) return "operator";
  // A branch decides which steps run; it reshapes no data.
  if (node.type === "branch") return "logic";
  // A process that isn't nf-core's: a custom process (or a node kept from an import).
  return "custom";
};

export interface NodeKindStyle {
  label: string;
  /** On the node's top strip. */
  short: string;
  description: string;
  color: string;
  /** Text on the strip, readable on its color. */
  text: string;
  /** Inputs and outputs are pill-shaped, steps boxes; filled, outlined, dotted or dashed. */
  shape: "pill" | "pill-outline" | "solid" | "outline" | "dotted" | "dashed" | "diamond";
}

export const NODE_KINDS: Record<NodeKind, NodeKindStyle> = {
  input: {
    label: "Inputs",
    short: "Input",
    description: "Where data enters: File Input, Samplesheet, Parameters",
    color: "#7dd3fc",
    text: "#0c4a6e",
    shape: "pill",
  },
  nfcore: {
    label: "nf-core steps",
    short: "nf-core",
    description: "Tested tools from nf-core: modules, subworkflows and pipelines",
    color: "#00A878",
    text: "#ffffff",
    shape: "solid",
  },
  custom: {
    label: "Custom steps",
    short: "Custom step",
    description: "Processes written by hand: custom processes and your own nodes",
    color: "#c4b5fd",
    text: "#3b0764",
    shape: "outline",
  },
  text: {
    label: "Text steps",
    short: "Text step",
    description:
      "Steps N-WAVE writes for you on the contents of text files: Filter lines, Change text, Join files. Each runs as a process, one task per file.",
    color: "#5eead4",
    text: "#134e4a",
    shape: "dotted",
  },
  operator: {
    label: "Operators",
    short: "Operator",
    description: "Reshape channels between steps (filter, map, join, collect, …) with Nextflow's channel operators. They run no tool.",
    color: "#a3a3a3",
    text: "#1f2937",
    shape: "dashed",
  },
  logic: {
    label: "Logic",
    short: "Logic",
    description: "Branches (if / else if / else): which steps run, chosen by the workflow's parameters. They run no tool.",
    color: "#e879f9",
    text: "#4a044e",
    shape: "diamond",
  },
  output: {
    label: "Outputs",
    short: "Output",
    description: "Where results come out: Display Output shows them and saves them as the run's results",
    color: "#fcd34d",
    text: "#713f12",
    shape: "pill-outline",
  },
};

export const NODE_KIND_ORDER: NodeKind[] = ["input", "nfcore", "custom", "text", "operator", "logic", "output"];
