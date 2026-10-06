import type { Edge } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";

// Turns the input layout of an nf-core module (one group per process
// argument, see scripts/nfcoreModuleParser.mjs) into the channel expressions
// passed to the module call.

/** How a path field's upstream channel is fed to the module. */
export type NfCoreChannelMode = "each" | "first" | "collect";

export type NfCoreInputItem =
  | { kind: "meta"; name: string }
  | { kind: "path"; name: string; mode: NfCoreChannelMode; stageAs?: string }
  | { kind: "val"; name: string };

export interface NfCoreModuleInputGroup {
  argumentIndex: number;
  handle: string;
  tuple: boolean;
  metaName: string | null;
  /** Path field names (the node's input ports). */
  fields: string[];
  /** Full layout of the argument; missing in catalogs before schema 2. */
  items?: NfCoreInputItem[];
}

export type NfCoreValueType =
  | "boolean"
  | "integer"
  | "float"
  | "string"
  | "expression";

/** A `val` input, shown as a node setting. */
export interface NfCoreValueInput {
  name: string;
  type: NfCoreValueType;
  description?: string;
  defaultValue: string | number | boolean;
}

export interface NfCoreInputChannel {
  /** Expression passed as the module argument. */
  name: string;
  /** Statement defining `name`, emitted before the call. */
  definition?: string;
}

interface BuildContext {
  groups: NfCoreModuleInputGroup[];
  valueInputs: NfCoreValueInput[];
  data: NodeData;
  processName: string;
  incomingEdges: Edge[];
  resolveUpstream: (edge: Edge) => string | null;
  sanitizeVarName: (name: string) => string;
}

/** Groups from older catalogs only list path fields: treat them as per-item. */
export const getGroupItems = (
  group: NfCoreModuleInputGroup,
): NfCoreInputItem[] =>
  group.items ?? [
    ...(group.metaName
      ? [{ kind: "meta" as const, name: group.metaName }]
      : []),
    ...group.fields.map((name) => ({
      kind: "path" as const,
      name,
      mode: "each" as const,
    })),
  ];

// Upstream items are either files or `[meta, files...]` tuples (nf-core
// outputs). These Groovy snippets take them apart.

/** Groovy condition: `item` is a `[meta, files...]` tuple. */
const hasMeta = (item: string): string =>
  `${item} instanceof List && ${item}.size() > 1 && ${item}[0] instanceof Map`;

/** Groovy closures defined at the top of each generated map closure. */
const HELPER_CLOSURES = [
  `def filesOf = { item -> ${hasMeta("item")} ? (item.size() == 2 ? item[1] : item[1..-1]) : item }`,
  `def metaOf = { item -> ${hasMeta("item")} ? item[0] : null }`,
];

const RESERVED_NAMES = new Set([
  "meta",
  "filesOf",
  "metaOf",
  "it",
  "in",
  "as",
  "def",
  "if",
  "else",
  "for",
  "while",
  "class",
  "new",
  "return",
  "true",
  "false",
  "null",
]);

/** A Groovy local variable name for a path field. */
const localName = (name: string): string =>
  RESERVED_NAMES.has(name) || /^in\d+$/.test(name) ? `${name}_` : name;

const groovyString = (value: string): string =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** The Groovy literal for a value input, from the node's settings. */
export const valueLiteral = (
  input: NfCoreValueInput,
  data: NodeData,
): string => {
  const values = (data.nfcoreValues ?? {}) as Record<string, unknown>;
  const value = values[input.name] ?? input.defaultValue;

  switch (input.type) {
    case "boolean":
      return value === true || value === "true" ? "true" : "false";
    case "integer":
    case "float": {
      const number = Number(value);
      return value !== "" && Number.isFinite(number) ? String(number) : "0";
    }
    case "string":
      return groovyString(String(value ?? ""));
    default:
      return String(value ?? "").trim() || "[]";
  }
};

/** Literal for an argument with nothing connected: `[]` or `[[:], [], ...]`. */
const emptyGroupLiteral = (
  items: NfCoreInputItem[],
  literalFor: (name: string) => string,
): string => {
  const parts = items.map((item) =>
    item.kind === "meta"
      ? "[:]"
      : item.kind === "path"
        ? "[]"
        : literalFor(item.name),
  );
  return parts.length === 1 ? parts[0] : `[${parts.join(", ")}]`;
};

/**
 * Build one channel expression per module argument, in declaration order.
 * Returns null while the primary input (the first argument with path
 * fields) has nothing connected; other unconnected inputs are passed as
 * empty placeholders, the way nf-core pipelines skip optional inputs.
 */
export const buildNfCoreGroupChannels = (
  context: BuildContext,
): NfCoreInputChannel[] | null => {
  const { data, incomingEdges, processName, resolveUpstream, sanitizeVarName } =
    context;
  const valueInputs = new Map(
    context.valueInputs.map((input) => [input.name, input]),
  );
  const literalFor = (name: string): string => {
    const input = valueInputs.get(name);
    return input
      ? valueLiteral(input, data)
      : valueLiteral({ name, type: "expression", defaultValue: "[]" }, data);
  };

  const groups = context.groups
    .slice()
    .sort((left, right) => left.argumentIndex - right.argumentIndex);
  const primaryGroup = groups.find((group) =>
    getGroupItems(group).some((item) => item.kind === "path"),
  );
  const hasPathPorts = groups.some((group) =>
    getGroupItems(group).some((item) => item.kind === "path"),
  );
  const firstPort = groups
    .flatMap((group) => getGroupItems(group))
    .find((item) => item.kind === "path")?.name;

  const upstreamFor = (port: string): string | null => {
    const edge =
      incomingEdges.find((candidate) => candidate.targetHandle === port) ??
      (port === firstPort
        ? incomingEdges.find((candidate) => !candidate.targetHandle)
        : undefined);
    return edge ? resolveUpstream(edge) : null;
  };

  const channels: NfCoreInputChannel[] = [];

  for (const group of groups) {
    const items = getGroupItems(group);
    const paths = items.flatMap((item) =>
      item.kind === "path" ? [{ item, upstream: upstreamFor(item.name) }] : [],
    );
    const connected = paths.filter(
      (path): path is { item: typeof path.item; upstream: string } =>
        path.upstream !== null,
    );

    if (connected.length === 0) {
      if (group === primaryGroup && hasPathPorts) return null;
      channels.push({ name: emptyGroupLiteral(items, literalFor) });
      continue;
    }

    const channelName = sanitizeVarName(
      `ch_${processName}_${group.handle}_nfcore`,
    );

    // Feed each connected field according to its mode.
    const sources = connected.map(({ item, upstream }) => {
      if (item.mode === "first") return `${upstream}.first()`;
      if (item.mode === "collect") {
        return `${upstream}.map { item -> ${hasMeta("item")} ? item[1..-1] : item }.collect()`;
      }
      return upstream;
    });

    if (!group.tuple && items.length === 1) {
      const expression =
        connected[0].item.mode === "collect"
          ? sources[0]
          : `${sources[0]}.map { item -> ${hasMeta("item")} ? (item.size() == 2 ? item[1] : item[1..-1]) : item }`;
      channels.push({
        name: channelName,
        definition: `    ${channelName} = ${expression}\n`,
      });
      continue;
    }

    const args = connected.map((_, index) => `in${index}`);
    const closureArgs = args.join(", ");
    // Wrap items so combine() keeps each upstream item whole.
    const combined =
      sources.length === 1
        ? sources[0]
        : sources
            .map((source) => `${source}.map { item -> [item] }`)
            .reduce(
              (current, source) => `${current}\n        .combine(${source})`,
            );

    // Per-sample files from different upstreams must belong to one sample.
    const perSample = connected.flatMap(({ item }, index) =>
      item.mode === "each" ? [args[index]] : [],
    );
    const filter =
      perSample.length > 1
        ? `\n        .filter { ${closureArgs} -> [${perSample.join(", ")}].findAll { ${hasMeta("it")} }.collect { it[0].id }.unique().size() <= 1 }`
        : "";

    const locals = connected.map(({ item }, index) => ({
      item,
      arg: args[index],
      local: localName(item.name),
    }));
    const fileLines = locals.map(({ item, arg, local }) =>
      item.mode === "collect"
        ? `            def ${local} = ${arg}`
        : `            def ${local} = filesOf(${arg})`,
    );
    const metaCandidates = locals
      .filter(({ item }) => item.mode !== "collect")
      .map(({ arg }) => `metaOf(${arg})`);
    const first = locals[0];
    const builtMeta =
      first.item.mode === "collect"
        ? "[id: 'all_samples']"
        : `[id: (${first.local} instanceof List ? ${first.local}[0] : ${first.local}).simpleName${
            group.metaName === "meta"
              ? `, single_end: !(${first.local} instanceof List && ${first.local}.size() > 1)`
              : ""
          }]`;

    const tupleValues = items.map((item) => {
      if (item.kind === "meta") return "meta";
      if (item.kind === "val") return literalFor(item.name);
      return locals.find((local) => local.item === item)?.local ?? "[]";
    });

    const lines = [
      `    ${channelName} = ${combined}${filter}`,
      `        .map { ${closureArgs} ->`,
      ...HELPER_CLOSURES.map((helper) => `            ${helper}`),
      ...fileLines,
      group.metaName
        ? `            def meta = ${[...metaCandidates, builtMeta].join(" ?: ")}`
        : undefined,
      `            tuple(${tupleValues.join(", ")})`,
      // combine() of value channels emits once; keep the reference reusable.
      perSample.length === 0 && sources.length > 1
        ? "        }.first()\n"
        : "        }\n",
    ].filter((line): line is string => line !== undefined);

    channels.push({ name: channelName, definition: lines.join("\n") });
  }

  return channels;
};
