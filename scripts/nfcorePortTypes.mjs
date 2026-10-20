// What each port of an nf-core module carries, read from its meta.yml: a
// file (with its name pattern, when the module gives one), a directory, a
// value or the tool's versions. The canvas uses this to warn about
// connections between ports that don't fit (see frontend/src/registry/portTypes.ts).

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/** `- name: { type, pattern }` entries, flattening tuples. */
const elements = (value) => {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([name, fields]) => ({
    name,
    fields: isRecord(fields) ? fields : {},
  }));
};

/** The sample/reference map that travels with a tuple's files. */
const isMeta = (element) => /^meta\d*$/.test(element.name) && element.fields.type === "map";

const VALUE_TYPES = new Set(["string", "integer", "float", "boolean", "number", "list", "map", "eval"]);

/**
 * One port's kind from the elements it carries (meta maps left out). Only
 * outputs carry versions: process name, tool and version strings.
 */
const portType = (described, { output = false } = {}) => {
  if (described.length === 0) return null;
  if (output && described.every((element) => ["string", "eval"].includes(element.fields.type))) {
    return { type: "version" };
  }
  const [main] = described;
  const type = String(main.fields.type ?? "");
  if (type === "file") {
    const pattern = typeof main.fields.pattern === "string" ? main.fields.pattern.trim() : "";
    return pattern ? { type: "file", pattern } : { type: "file" };
  }
  if (type === "directory") return { type: "directory" };
  if (VALUE_TYPES.has(type)) return { type: "value" };
  return null;
};

/**
 * Port kinds by port name: inputs by each tuple element's name (each is a
 * port of the node), outputs by emit name.
 */
export const getPortTypes = (meta) => {
  const inputs = {};
  const outputs = {};
  if (!isRecord(meta)) return { inputs, outputs };

  for (const entry of Array.isArray(meta.input) ? meta.input : []) {
    for (const element of elements(entry).filter((item) => !isMeta(item))) {
      const kind = portType([element]);
      if (kind) inputs[element.name] = kind;
    }
  }

  // Current meta.yml files map each emit to its tuples; older ones list
  // the elements, one output each.
  const output = meta.output;
  const entries = isRecord(output)
    ? Object.entries(output).map(([name, tuple]) => [name, elements(tuple)])
    : elements(output).map((element) => [element.name, [element]]);
  for (const [name, items] of entries) {
    const kind = portType(items.filter((item) => !isMeta(item)), { output: true });
    if (kind) outputs[name] = kind;
  }
  return { inputs, outputs };
};
