// What an nf-core module or subworkflow documents about itself in its
// meta.yml: a description, its tools and what each input and output holds.
// The panel shows this so a node's many ports aren't a mystery.

import { parse } from "yaml";
import { isNfCoreSubworkflowId } from "./subworkflow";

export interface NfCorePortDoc {
  /** The port name, as on the node (e.g. "reads", "bam_sorted"). */
  name: string;
  type: string;
  description: string;
  /** File name pattern, e.g. "*.{bam}". */
  pattern?: string;
  /** A tuple's files, when the port carries more than one. */
  parts?: Array<{ name: string; description: string }>;
}

export interface NfCoreToolDoc {
  name: string;
  description: string;
  homepage?: string;
  documentation?: string;
}

export interface NfCoreModuleDocs {
  description: string;
  tools: NfCoreToolDoc[];
  inputs: NfCorePortDoc[];
  outputs: NfCorePortDoc[];
}

/** The module's page on nf-co.re, e.g. https://nf-co.re/modules/star_align. */
export const nfCoreDocsUrl = (id: string): string =>
  isNfCoreSubworkflowId(id)
    ? `https://nf-co.re/subworkflows/${id.replace("nf-core/subworkflows/", "")}`
    : `https://nf-co.re/modules/${id.replace(/^nf-core\//, "").replace(/\//g, "_")}`;

type Item = { name: string; fields: Record<string, unknown> };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

/** `- name: { type, description }` entries, flattening tuples. */
const items = (value: unknown): Item[] => {
  if (Array.isArray(value)) return value.flatMap(items);
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([name, fields]) => ({
    name,
    fields: isRecord(fields) ? fields : {},
  }));
};

/** The sample/reference map that travels with each file in a tuple. */
const isMeta = (item: Item) =>
  /^meta\d*$/.test(item.name) && text(item.fields.type) === "map";

/** One port from the elements of a tuple (or a lone element). */
const portDoc = (name: string, elements: Item[]): NfCorePortDoc => {
  const described = elements.filter((item) => !isMeta(item));
  const isVersion =
    described.length > 0 &&
    described.every((item) =>
      ["string", "eval"].includes(text(item.fields.type)),
    );
  if (isVersion) {
    return {
      name,
      type: "version",
      description:
        "The tool's version, collected for reports such as MultiQC's software versions.",
    };
  }
  const main = described[0] ?? elements[0];
  const pattern = text(main?.fields.pattern);
  return {
    name,
    type: text(main?.fields.type),
    description: text(main?.fields.description),
    ...(pattern ? { pattern } : {}),
    ...(described.length > 1
      ? {
          parts: described.map((item) => ({
            name: item.name,
            description: text(item.fields.description),
          })),
        }
      : {}),
  };
};

/**
 * Inputs: a list whose entries are tuples (lists) or single elements. Every
 * file of a tuple is documented under its own name, since nodes may give
 * each its own port; the first also lists the whole tuple, for nodes whose
 * port carries all of it.
 */
const inputDocs = (value: unknown): NfCorePortDoc[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const elements = items(entry).filter((item) => !isMeta(item));
    if (!Array.isArray(entry)) {
      return elements.map((item) => portDoc(item.name, [item]));
    }
    const [first, ...rest] = elements;
    if (!first) return [];
    return [
      portDoc(first.name, elements),
      ...rest.map((item) => portDoc(item.name, [item])),
    ];
  });
};

/**
 * Outputs: current meta.yml files map each emit name to its tuples; older
 * ones list the elements, one per output.
 */
const outputDocs = (value: unknown): NfCorePortDoc[] => {
  if (isRecord(value)) {
    return Object.entries(value).map(([name, tuple]) =>
      portDoc(name, items(tuple)),
    );
  }
  return inputDocs(value);
};

/** Parse a meta.yml; null when it isn't one. */
export const parseNfCoreMeta = (source: string): NfCoreModuleDocs | null => {
  let meta: unknown;
  try {
    meta = parse(source);
  } catch {
    return null;
  }
  if (!isRecord(meta)) return null;
  return {
    description: text(meta.description),
    tools: items(meta.tools).map(({ name, fields }) => ({
      name,
      description: text(fields.description),
      ...(text(fields.homepage) ? { homepage: text(fields.homepage) } : {}),
      ...(text(fields.documentation)
        ? { documentation: text(fields.documentation) }
        : {}),
    })),
    inputs: inputDocs(meta.input),
    outputs: outputDocs(meta.output),
  };
};
