// What a node is, at a glance: where data enters the workflow (inputs), a
// step from nf-core, or any other step. The workflow previews and the canvas
// show these kinds with the same colors and shapes, explained by the same
// legend; the shapes tell them apart without color too.

export type NodeKind = "input" | "nfcore" | "step";

const INPUT_TYPES = new Set(["fileInput", "samplesheet", "parameters"]);

/** The kind of a node; notes have none. */
export const nodeKindOf = (node: {
  type?: string;
  data?: Record<string, unknown>;
}): NodeKind | null => {
  if (node.type === "note") return null;
  if (INPUT_TYPES.has(node.type ?? "")) return "input";
  if (node.type === "pipeline" || String(node.data?.processType ?? "").startsWith("nfcore")) {
    return "nfcore";
  }
  return "step";
};

export interface NodeKindStyle {
  label: string;
  description: string;
  color: string;
  /** Inputs are pill-shaped, nf-core steps solid, other steps outlined. */
  shape: "pill" | "solid" | "outline";
}

export const NODE_KINDS: Record<NodeKind, NodeKindStyle> = {
  input: {
    label: "Inputs",
    description: "Where data enters: File Input, Samplesheet, Parameters",
    color: "#7dd3fc",
    shape: "pill",
  },
  nfcore: {
    label: "nf-core steps",
    description: "Modules, subworkflows and pipelines from nf-core",
    color: "#00A878",
    shape: "solid",
  },
  step: {
    label: "Other steps",
    description: "Operators, custom processes and outputs",
    color: "#a3a3a3",
    shape: "outline",
  },
};

export const NODE_KIND_ORDER: NodeKind[] = ["input", "nfcore", "step"];
