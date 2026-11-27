// Channel operator node: editable Nextflow channel code (join, mix, map,
// branch, ...) between other nodes. The code refers to its ports as
// `input.<name>` and `output.<name>`, and to its own helper variables as
// `local.<name>`; the generator rewrites these to the connected channels.

import type { NodeGenerator } from "./nodeGeneration";
import { buildMixedChannelExpression } from "../generators/core/mixChannels";
import { maskSource } from "../workflows/import/nextflowSource";

/** The groups of Nextflow's channel operators, in the order the template list shows them. */
export const CHANNEL_OPERATOR_GROUPS = [
  "Filtering",
  "Transforming",
  "Combining",
  "Forking",
  "Splitting files",
  "Counting and maths",
  "Other",
] as const;
export type ChannelOperatorGroup = (typeof CHANNEL_OPERATOR_GROUPS)[number];

export interface ChannelOperatorTemplate {
  /** The operator's name in Nextflow. */
  id: string;
  label: string;
  description: string;
  group: ChannelOperatorGroup;
  inputs: string[];
  outputs: string[];
  code: string;
  /** Nextflow's reference advises against it (shown with the template). */
  discouraged?: string;
}

const lines = (...code: string[]) => code.join("\n");

/**
 * One template for each of Nextflow's channel operators (its operator
 * reference, version 25.10), most written for samplesheet rows
 * (`[ meta, files ]`). They are starting points: the code can be changed.
 */
export const CHANNEL_OPERATOR_TEMPLATES: ChannelOperatorTemplate[] = [
  // Filtering
  {
    id: "filter",
    label: "Filter",
    description: "Keep the items that match a condition, e.g. only paired-end samples.",
    group: "Filtering",
    inputs: ["in"],
    outputs: ["kept"],
    code: "output.kept = input.in.filter { meta, _files -> !meta.single_end }",
  },
  {
    id: "unique",
    label: "Unique",
    description: "Drop repeated items, keeping the first of each.",
    group: "Filtering",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.unique()",
  },
  {
    id: "distinct",
    label: "Distinct",
    description: "Drop items that repeat the one just before them.",
    group: "Filtering",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.distinct()",
  },
  {
    id: "first",
    label: "First",
    description: "The first item, e.g. one reference every task can read.",
    group: "Filtering",
    inputs: ["in"],
    outputs: ["first"],
    code: "output.first = input.in.first()",
  },
  {
    id: "last",
    label: "Last",
    description: "The last item.",
    group: "Filtering",
    inputs: ["in"],
    outputs: ["last"],
    code: "output.last = input.in.last()",
  },
  {
    id: "take",
    label: "Take",
    description: "The first few items, e.g. to try a workflow on three samples.",
    group: "Filtering",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.take(3)",
  },
  {
    id: "randomSample",
    label: "Random sample",
    description: "A random subset of the items (the seed makes it repeatable).",
    group: "Filtering",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.randomSample(10, 42)",
  },
  {
    id: "until",
    label: "Until",
    description: "The items until one matches a condition.",
    group: "Filtering",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.until { meta, _files -> meta.id == 'last_sample' }",
  },
  // Transforming
  {
    id: "map",
    label: "Map [ meta, files ]",
    description: "Reshape each item, e.g. keep only some meta fields.",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["out"],
    code: lines("output.out = input.in.map { meta, files ->", "    [ meta.subMap('id', 'single_end'), files ]", "}"),
  },
  {
    id: "flatMap",
    label: "Flat map",
    description: "Turn each item into several, e.g. one item per file of a sample.",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["out"],
    code: lines("output.out = input.in.flatMap { meta, files ->", "    files.collect { file -> [ meta, file ] }", "}"),
  },
  {
    id: "flatten",
    label: "Flatten",
    description: "Every element of the items' lists as an item of its own.",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.flatten()",
  },
  {
    id: "transpose",
    label: "Transpose",
    description: "One item per file: [ meta, [ a, b ] ] becomes [ meta, a ] and [ meta, b ].",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.transpose()",
  },
  {
    id: "groupTuple",
    label: "Group by sample id",
    description: "Gather the files of rows with the same sample id (technical replicates).",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["grouped"],
    code: lines(
      "output.grouped = input.in",
      "    .map { meta, files -> [ meta.id, meta, files ] }",
      "    .groupTuple()",
      "    .map { _id, metas, files -> [ metas[0], files.flatten() ] }",
    ),
  },
  {
    id: "buffer",
    label: "Buffer",
    description: "Items in groups of a given size (the rest in a smaller last group).",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["groups"],
    code: "output.groups = input.in.buffer(size: 2, remainder: true)",
  },
  {
    id: "collate",
    label: "Collate",
    description: "Items in lists of N, e.g. to process samples in batches.",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["batches"],
    code: "output.batches = input.in.collate(4)",
  },
  {
    id: "collect",
    label: "Collect",
    description: "All items in one list, e.g. for a summary step.",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["all"],
    code: "output.all = input.in.collect()",
  },
  {
    id: "toList",
    label: "To list",
    description: "All items in one list (an empty list when there are none).",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["all"],
    code: "output.all = input.in.toList()",
  },
  {
    id: "toSortedList",
    label: "To sorted list",
    description: "All items in one list, sorted, e.g. by sample id.",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["all"],
    code: "output.all = input.in.toSortedList { a, b -> a[0].id <=> b[0].id }",
  },
  {
    id: "reduce",
    label: "Reduce",
    description: "Combine all items into one value, item by item.",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["total"],
    code: "output.total = input.in.reduce(0) { total, _item -> total + 1 }",
  },
  {
    id: "toInteger",
    label: "To integer",
    description: "Text items (\"42\") as numbers.",
    group: "Transforming",
    inputs: ["in"],
    outputs: ["numbers"],
    code: "output.numbers = input.in.toInteger()",
  },
  // Combining
  {
    id: "join",
    label: "Join by sample",
    description: "Pair items of two channels with the same key (e.g. meta).",
    group: "Combining",
    inputs: ["left", "right"],
    outputs: ["joined"],
    code: "output.joined = input.left.join(input.right)",
  },
  {
    id: "mix",
    label: "Mix",
    description: "Merge the items of two channels into one channel.",
    group: "Combining",
    inputs: ["a", "b"],
    outputs: ["mixed"],
    code: "output.mixed = input.a.mix(input.b)",
  },
  {
    id: "concat",
    label: "Concat",
    description: "The items of one channel, then those of the other, in that order.",
    group: "Combining",
    inputs: ["a", "b"],
    outputs: ["both"],
    code: "output.both = input.a.concat(input.b)",
  },
  {
    id: "combine",
    label: "Combine",
    description: "Every item of one channel with every item of the other.",
    group: "Combining",
    inputs: ["left", "right"],
    outputs: ["combined"],
    code: "output.combined = input.left.combine(input.right)",
  },
  {
    id: "cross",
    label: "Cross",
    description: "Every pair of items of two channels with the same key.",
    group: "Combining",
    inputs: ["left", "right"],
    outputs: ["pairs"],
    code: "output.pairs = input.left.cross(input.right)",
  },
  {
    id: "merge",
    label: "Merge",
    description: "Pair the items of two channels by their order.",
    group: "Combining",
    inputs: ["a", "b"],
    outputs: ["merged"],
    code: "output.merged = input.a.merge(input.b)",
    discouraged:
      "Nextflow advises against merge: steps don't always emit items in the order they received them. Join by a key instead.",
  },
  // Forking
  {
    id: "branch",
    label: "Branch",
    description: "Split a channel by a condition, e.g. single- vs paired-end.",
    group: "Forking",
    inputs: ["in"],
    outputs: ["single", "paired"],
    code: lines(
      "local.branched = input.in.branch { meta, _reads ->",
      "    single: meta.single_end",
      "    paired: true",
      "}",
      "output.single = local.branched.single",
      "output.paired = local.branched.paired",
    ),
  },
  {
    id: "multiMap",
    label: "Multi map",
    description: "Several channels from each item, e.g. the reads and the sample ids.",
    group: "Forking",
    inputs: ["in"],
    outputs: ["reads", "ids"],
    code: lines(
      "local.forked = input.in.multiMap { meta, files ->",
      "    reads: [ meta, files ]",
      "    ids: meta.id",
      "}",
      "output.reads = local.forked.reads",
      "output.ids = local.forked.ids",
    ),
  },
  {
    id: "tap",
    label: "Tap",
    description: "The same items twice: on as they are, and as a second channel.",
    group: "Forking",
    inputs: ["in"],
    outputs: ["out", "copy"],
    code: "output.out = input.in.tap { output.copy }",
  },
  {
    id: "set",
    label: "Set",
    description: "The items as they are, under a name of their own.",
    group: "Forking",
    inputs: ["in"],
    outputs: ["out"],
    code: "input.in.set { output.out }",
  },
  // Splitting files
  {
    id: "splitCsv",
    label: "Split CSV",
    description: "One item per row of CSV files (a map by column with a header).",
    group: "Splitting files",
    inputs: ["files"],
    outputs: ["rows"],
    code: "output.rows = input.files.splitCsv(header: true)",
  },
  {
    id: "splitText",
    label: "Split text",
    description: "Text files in chunks of N lines.",
    group: "Splitting files",
    inputs: ["files"],
    outputs: ["chunks"],
    code: "output.chunks = input.files.splitText(by: 1000, file: true)",
  },
  {
    id: "splitFasta",
    label: "Split FASTA",
    description: "FASTA files in chunks of N sequences.",
    group: "Splitting files",
    inputs: ["files"],
    outputs: ["chunks"],
    code: "output.chunks = input.files.splitFasta(by: 1000, file: true)",
  },
  {
    id: "splitFastq",
    label: "Split FASTQ",
    description: "FASTQ files in chunks of N reads.",
    group: "Splitting files",
    inputs: ["files"],
    outputs: ["chunks"],
    code: "output.chunks = input.files.splitFastq(by: 100000, file: true)",
  },
  {
    id: "splitJson",
    label: "Split JSON",
    description: "One item per record of JSON files.",
    group: "Splitting files",
    inputs: ["files"],
    outputs: ["records"],
    code: "output.records = input.files.splitJson()",
  },
  // Counting and maths
  {
    id: "count",
    label: "Count",
    description: "How many items the channel has.",
    group: "Counting and maths",
    inputs: ["in"],
    outputs: ["n"],
    code: "output.n = input.in.count()",
  },
  {
    id: "countLines",
    label: "Count lines",
    description: "How many lines text files have, in all.",
    group: "Counting and maths",
    inputs: ["files"],
    outputs: ["n"],
    code: "output.n = input.files.countLines()",
  },
  {
    id: "countFasta",
    label: "Count FASTA",
    description: "How many sequences FASTA files have, in all.",
    group: "Counting and maths",
    inputs: ["files"],
    outputs: ["n"],
    code: "output.n = input.files.countFasta()",
  },
  {
    id: "countFastq",
    label: "Count FASTQ",
    description: "How many reads FASTQ files have, in all.",
    group: "Counting and maths",
    inputs: ["files"],
    outputs: ["n"],
    code: "output.n = input.files.countFastq()",
  },
  {
    id: "countJson",
    label: "Count JSON",
    description: "How many records JSON files have, in all.",
    group: "Counting and maths",
    inputs: ["files"],
    outputs: ["n"],
    code: "output.n = input.files.countJson()",
  },
  {
    id: "min",
    label: "Min",
    description: "The smallest item.",
    group: "Counting and maths",
    inputs: ["numbers"],
    outputs: ["min"],
    code: "output.min = input.numbers.min()",
  },
  {
    id: "max",
    label: "Max",
    description: "The largest item.",
    group: "Counting and maths",
    inputs: ["numbers"],
    outputs: ["max"],
    code: "output.max = input.numbers.max()",
  },
  {
    id: "sum",
    label: "Sum",
    description: "The sum of the items.",
    group: "Counting and maths",
    inputs: ["numbers"],
    outputs: ["sum"],
    code: "output.sum = input.numbers.sum()",
  },
  // Other
  {
    id: "collectFile",
    label: "Collect file",
    description: "The items written into one file, e.g. a list of sample ids.",
    group: "Other",
    inputs: ["in"],
    outputs: ["file"],
    code: "output.file = input.in.map { meta, _files -> meta.id }.collectFile(name: 'samples.txt', newLine: true)",
  },
  {
    id: "ifEmpty",
    label: "If empty",
    description: "Stop with a message when no items come (or give a default).",
    group: "Other",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.ifEmpty { error('No samples: check the samplesheet') }",
  },
  {
    id: "view",
    label: "View",
    description: "Print each item to the run's log, and pass it on.",
    group: "Other",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.view()",
  },
  {
    id: "dump",
    label: "Dump",
    description: "Print each item when the run is started with -dump-channels, and pass it on.",
    group: "Other",
    inputs: ["in"],
    outputs: ["out"],
    code: "output.out = input.in.dump(tag: 'items')",
  },
  {
    id: "subscribe",
    label: "Subscribe",
    description: "Run code for each item, e.g. to log it. It passes nothing on.",
    group: "Other",
    inputs: ["in"],
    outputs: [],
    code: "input.in.subscribe { item -> log.info(\"item: ${item}\") }",
  },
];

// Not after a dot (`params.input`), and only in code, not strings or comments.
const REFERENCE = /(?<![.\w$])(input|output|local)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;

/** Whether code assigns an output: `output.x = …`, `(output.x, output.y) = …`, `.set { output.x }` or `.tap { output.x }`. */
const assigns = (masked: string, output: string): boolean => {
  const port = `output\\.${output}(?![\\w])`;
  return (
    new RegExp(`(?<![.\\w$])${port}\\s*=(?!=)`).test(masked) ||
    new RegExp(`(?<![.\\w$])\\(\\s*(?:[\\w.]+\\s*,\\s*)*${port}\\s*(?:,\\s*[\\w.]+\\s*)*\\)\\s*=(?!=)`).test(masked) ||
    new RegExp(`\\.(?:set|tap)\\s*\\{\\s*${port}\\s*\\}`).test(masked)
  );
};

const references = (code: string) => Array.from(maskSource(code, { keepInterpolations: true }).matchAll(REFERENCE));

const replaceReferences = (code: string, replace: (kind: string, name: string) => string): string => {
  let result = "";
  let last = 0;
  for (const match of references(code)) {
    const start = match.index ?? 0;
    result += code.slice(last, start) + replace(match[1], match[2]);
    last = start + match[0].length;
  }
  return result + code.slice(last);
};

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
    // Fine for code like `.view()`; other steps can't connect to it.
    issues.push({ level: "warning", message: "It has no output, so other steps can't read its channels." });
  }

  const used = { input: new Set<string>(), output: new Set<string>() };
  for (const match of references(code)) {
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
    if (!assigns(maskSource(code), output)) {
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
  channelNameFor,
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
  // Each channel the code reads, so it comes after the steps that make them
  // (with several connections, the input is a `.concat()` of them).
  const used = new Set<string>();
  for (const input of inputs) {
    const channels = incomingEdges
      .filter((candidate) => candidate.targetHandle === input)
      .map((edge) => resolveChannelNameForEdge(edge, channelNameMap))
      .filter((name): name is string => Boolean(name));
    if (channels.length > 0) {
      for (const channel of channels) used.add(channel);
      upstream.set(input, buildMixedChannelExpression(channels));
    }
  }
  // Code with inputs waits for a connection; code without runs on its own.
  if (upstream.size === 0 && inputs.length > 0) return null;

  const outputChannel = (output: string) =>
    channelNameMap.get(`${node.id}.${output}`) ??
    sanitizeVarName(`${node.id}_${output}`);
  // Helper variables named after the node ("branch_branched"), unique in the script.
  const locals = new Map<string, string>();
  // Not `ch_…`: that reads as a channel other steps use.
  const base =
    String(node.data.label || "channels").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^ch_/, "") || "channels";
  const localName = (name: string) => {
    if (!locals.has(name)) {
      // Imported code already has the prefix.
      const wanted = name.startsWith(`${base}_`) ? name : `${base}_${name}`;
      locals.set(name, channelNameFor ? channelNameFor(wanted) : sanitizeVarName(`${node.id}_${name}`));
    }
    return locals.get(name) as string;
  };

  const defines = new Set<string>();
  const statement = replaceReferences(
    code,
    (kind: string, name: string) => {
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
      uses: Array.from(used),
    },
  };
};
