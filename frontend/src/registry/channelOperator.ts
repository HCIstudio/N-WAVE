// Channel operator node: editable Nextflow channel code (join, mix, map,
// branch, ...) between other nodes. The code refers to its ports as
// `input.<name>` and `output.<name>`, and to its own helper variables as
// `local.<name>`; the generator rewrites these to the connected channels.

import type { NodeGenerator } from "./nodeGeneration";

export interface ChannelOperatorTemplate {
  id: string;
  label: string;
  description: string;
  inputs: string[];
  outputs: string[];
  code: string;
}

export const CHANNEL_OPERATOR_TEMPLATES: ChannelOperatorTemplate[] = [
  {
    id: "join",
    label: "Join by sample",
    description: "Pair items of two channels with the same key (e.g. meta).",
    inputs: ["left", "right"],
    outputs: ["joined"],
    code: "output.joined = input.left.join(input.right)",
  },
  {
    id: "mix",
    label: "Mix",
    description: "Merge the items of two channels into one channel.",
    inputs: ["a", "b"],
    outputs: ["mixed"],
    code: "output.mixed = input.a.mix(input.b)",
  },
  {
    id: "map",
    label: "Map [ meta, files ]",
    description: "Reshape each item, e.g. keep only some meta fields.",
    inputs: ["in"],
    outputs: ["out"],
    code: [
      "output.out = input.in.map { meta, files ->",
      "    [ meta.subMap('id', 'single_end'), files ]",
      "}",
    ].join("\n"),
  },
  {
    id: "branch",
    label: "Branch",
    description: "Split a channel by a condition, e.g. single- vs paired-end.",
    inputs: ["in"],
    outputs: ["single", "paired"],
    code: [
      "local.branched = input.in.branch { meta, reads ->",
      "    single: meta.single_end",
      "    paired: true",
      "}",
      "output.single = local.branched.single",
      "output.paired = local.branched.paired",
    ].join("\n"),
  },
  {
    id: "combine",
    label: "Combine",
    description: "Every item of one channel with every item of the other.",
    inputs: ["left", "right"],
    outputs: ["combined"],
    code: "output.combined = input.left.combine(input.right)",
  },
  {
    id: "groupTuple",
    label: "Group by sample id",
    description:
      "Gather the files of rows with the same sample id (technical replicates).",
    inputs: ["in"],
    outputs: ["grouped"],
    code: [
      "output.grouped = input.in",
      "    .map { meta, files -> [ meta.id, meta, files ] }",
      "    .groupTuple()",
      "    .map { id, metas, files -> [ metas[0], files.flatten() ] }",
    ].join("\n"),
  },
  {
    id: "collect",
    label: "Collect",
    description: "All items in one list, e.g. for a summary step.",
    inputs: ["in"],
    outputs: ["all"],
    code: "output.all = input.in.collect()",
  },
];

const REFERENCE = /\b(input|output|local)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

export interface ChannelOperatorIssue {
  level: "error" | "warning";
  message: string;
}

/** Problems with a channel operator's ports and code. */
export const validateChannelOperator = ({
  inputs,
  outputs,
  code,
}: {
  inputs: string[];
  outputs: string[];
  code: string;
}): ChannelOperatorIssue[] => {
  const issues: ChannelOperatorIssue[] = [];
  const name = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const port of [...inputs, ...outputs]) {
    if (!name.test(port)) {
      issues.push({
        level: "error",
        message: `"${port}" isn't a valid port name.`,
      });
    }
  }
  const duplicates = [...inputs, ...outputs].filter(
    (port, index, all) => all.indexOf(port) !== index,
  );
  if (duplicates.length > 0) {
    issues.push({
      level: "error",
      message: `Port names must be unique: ${Array.from(new Set(duplicates)).join(", ")}.`,
    });
  }
  if (outputs.length === 0) {
    issues.push({ level: "error", message: "Add at least one output." });
  }

  const used = { input: new Set<string>(), output: new Set<string>() };
  for (const match of code.matchAll(REFERENCE)) {
    const [, kind, port] = match;
    if (kind === "input") {
      used.input.add(port);
      if (!inputs.includes(port)) {
        issues.push({
          level: "error",
          message: `input.${port} isn't an input of this node.`,
        });
      }
    } else if (kind === "output") {
      used.output.add(port);
      if (!outputs.includes(port)) {
        issues.push({
          level: "error",
          message: `output.${port} isn't an output of this node.`,
        });
      }
    }
  }
  for (const output of outputs) {
    if (!new RegExp(`\\boutput\\.${output}\\s*=(?!=)`).test(code)) {
      issues.push({
        level: "error",
        message: `output.${output} is never assigned (write "output.${output} = ...").`,
      });
    }
  }
  for (const input of inputs) {
    if (!used.input.has(input)) {
      issues.push({
        level: "warning",
        message: `input.${input} isn't used in the code.`,
      });
    }
  }
  return Array.from(
    new Map(issues.map((issue) => [issue.message, issue])).values(),
  );
};

const portNames = (ports: unknown): string[] =>
  Array.isArray(ports)
    ? ports
        .map((port) => (port as { name?: unknown })?.name)
        .filter((name): name is string => typeof name === "string")
    : [];

/**
 * Rewrite the node's code into workflow statements. Inputs without a
 * connection become `Channel.empty()`. Returns null when the code has
 * errors.
 */
export const generateChannelOperatorNode: NodeGenerator = ({
  node,
  incomingEdges,
  channelNameMap,
  resolveChannelNameForEdge,
  sanitizeVarName,
}) => {
  const inputs = portNames(node.data.inputs);
  const outputs = portNames(node.data.outputs);
  const code =
    typeof node.data.channelOperatorCode === "string"
      ? node.data.channelOperatorCode
      : "";
  if (
    validateChannelOperator({ inputs, outputs, code }).some(
      (issue) => issue.level === "error",
    )
  ) {
    return null;
  }

  const upstream = new Map<string, string>();
  for (const input of inputs) {
    const edge = incomingEdges.find(
      (candidate) => candidate.targetHandle === input,
    );
    const channel = edge
      ? resolveChannelNameForEdge(edge, channelNameMap)
      : null;
    if (channel) upstream.set(input, channel);
  }
  if (upstream.size === 0) return null;

  const outputChannel = (output: string) =>
    channelNameMap.get(`${node.id}.${output}`) ??
    sanitizeVarName(`${node.id}_${output}`);
  const localName = (name: string) => sanitizeVarName(`${node.id}_${name}`);

  const defines = new Set<string>();
  const statement = code.replace(
    REFERENCE,
    (_match, kind: string, name: string) => {
      if (kind === "input") return upstream.get(name) ?? "Channel.empty()";
      const variable =
        kind === "output" ? outputChannel(name) : localName(name);
      defines.add(variable);
      return variable;
    },
  );

  return {
    processScript: "",
    // No leading comment: the ordering treats "//" invocations as comments.
    processInvocations: [
      `${statement
        .trim()
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n")}\n`,
    ],
    includeInExecutionOrder: false,
    dependencies: {
      defines: Array.from(defines),
      uses: Array.from(new Set(upstream.values())),
    },
  };
};
