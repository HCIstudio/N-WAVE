// What a node is, at a glance: where data enters the workflow (inputs), a
// step from nf-core, a step written by hand (custom), an operator that
// reshapes channels between steps, or where results come out (outputs). The
// workflow previews and the canvas show these kinds with the same colors and
// shapes, explained by the same legend; the shapes tell them apart without
// color too.

export type NodeKind = "input" | "nfcore" | "custom" | "operator" | "output";

const INPUT_TYPES = new Set(["fileInput", "samplesheet", "parameters"]);
/** Filter, Map, Merge and the like, and channel code kept from an import. */
const OPERATOR_TYPES = new Set(["operator", "filter", "channelOperator"]);

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
  if (OPERATOR_TYPES.has(node.type ?? "")) return "operator";
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
  /** Inputs and outputs are pill-shaped, steps boxes; filled, outlined or dashed. */
  shape: "pill" | "pill-outline" | "solid" | "outline" | "dashed";
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
  operator: {
    label: "Operators",
    short: "Operator",
    description: "Reshape the data between steps: Filter, Map, Merge and channel code. They run no tool.",
    color: "#a3a3a3",
    text: "#1f2937",
    shape: "dashed",
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

export const NODE_KIND_ORDER: NodeKind[] = ["input", "nfcore", "custom", "operator", "output"];
