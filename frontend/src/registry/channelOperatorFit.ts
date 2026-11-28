// Channel operator templates that fit the items they are given: the closure
// takes an item apart into the parts its upstream output declares
// (`tuple val(id), path(tif)` gives `{ id, tif -> … }`), and a filter's
// condition can be written as a form (a part, a comparison and a value).

import type { Edge, Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { COMPARISONS, type Comparison } from "../branches/conditionForm";
import { getNodeDefinitionForNode } from "./nodeDefinitions";

/** Nodes whose items are single files. */
const FILE_ITEMS = new Set(["fileInput", "operator", "filter", "parameters"]);

/**
 * The parts of the items coming into a node's input, by name (`["id", "tif"]`
 * for a tuple, `["file"]` for single files), or null when not known.
 */
export const itemFieldsInto = (nodeId: string, port: string, nodes: Node<NodeData>[], edges: Edge[]): string[] | null => {
  const edge = edges.find((candidate) => candidate.target === nodeId && candidate.targetHandle === port);
  const source = edge && nodes.find((node) => node.id === edge.source);
  if (!edge || !source) return null;
  if (source.type === "samplesheet") return ["meta", "reads"];
  if (FILE_ITEMS.has(String(source.type))) return ["file"];
  const output = [...(source.data.outputs ?? []), ...(getNodeDefinitionForNode(source)?.outputs ?? [])].find(
    (candidate) => candidate.name === edge.sourceHandle && (candidate.fields || candidate.metaTuple),
  );
  if (output?.fields?.length) return output.fields;
  return output?.metaTuple ? ["meta", "files"] : null;
};

/** The closure's parameters: the parts the body uses by name, the others marked unused (`_tif`). */
const parameters = (fields: string[], body: string): string =>
  fields.map((field) => (new RegExp(`(?<![\\w.])${field}(?!\\w)`).test(body) ? field : `_${field}`)).join(", ");

/** The templates that can fit their items. */
export const FITTING_TEMPLATES = new Set(["filter", "map", "flatMap"]);

/**
 * A template's code for items with these parts, or null when the template
 * doesn't take items apart (or they are what it was written for).
 */
export const fittedTemplateCode = (templateId: string, fields: string[]): string | null => {
  if (fields.length === 0 || !FITTING_TEMPLATES.has(templateId)) return null;
  const [first, ...rest] = fields;
  const last = fields[fields.length - 1];
  const single = fields.length === 1;
  if (templateId === "filter") {
    const condition = first === "meta" ? "!meta.single_end" : single ? `${first}.size() > 0` : `${first} == 'value'`;
    return writeFilterCode({ output: "kept", input: "in", fields, condition });
  }
  if (templateId === "map") {
    const body = single
      ? `[ ${first}.baseName, ${first} ]`
      : `[ ${first === "meta" ? "meta.subMap('id', 'single_end')" : first}, ${rest.join(", ")} ]`;
    return [`output.out = input.in.map { ${parameters(fields, body)} ->`, `    ${body}`, "}"].join("\n");
  }
  if (single) return `output.out = input.in.flatMap { ${first} -> ${first}.readLines() }`;
  const body = `${last}.collect { item -> [ ${fields.slice(0, -1).join(", ")}, item ] }`;
  return [`output.out = input.in.flatMap { ${parameters(fields, body)} ->`, `    ${body}`, "}"].join("\n");
};

/** A filter as a form: keep the items whose part (or its property) compares so with a value. */
export interface FilterForm {
  output: string;
  input: string;
  /** The item's parts, as the closure names them (without `_`). */
  fields: string[];
  /** `id`, `meta.single_end`: a part, or a property of one. */
  field: string;
  comparison: Comparison;
  /** As typed: text is quoted in the code, numbers aren't. */
  value: string;
}

const FILTER = /^output\.(\w+)\s*=\s*input\.(\w+)\s*\.filter\s*\{\s*([\w\s,]*?)\s*->\s*([\s\S]*?)\s*\}\s*$/;

const writeFilterCode = ({ output, input, fields, condition }: Pick<FilterForm, "output" | "input" | "fields"> & { condition: string }) =>
  `output.${output} = input.${input}.filter { ${parameters(fields, condition)} -> ${condition} }`;

/** The condition a filter form says, or null while it lacks a value. */
export const filterCondition = (form: FilterForm): string | null => {
  if (!form.field) return null;
  if (form.comparison === "isTrue") return form.field;
  if (form.comparison === "isFalse") return `!${form.field}`;
  const value = form.value.trim();
  if (!value) return null;
  const literal = /^-?\d+(\.\d+)?$/.test(value) ? value : `'${form.value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  return `${form.field} ${COMPARISONS[form.comparison].operator} ${literal}`;
};

/** A filter form's code, or null while it is incomplete. */
export const writeFilter = (form: FilterForm): string | null => {
  const condition = filterCondition(form);
  return condition === null ? null : writeFilterCode({ ...form, condition });
};

/**
 * The form for a filter's code (`output.kept = input.in.filter { id, _tif -> id == 'gv' }`),
 * or null when it is more than one comparison of a part with a value.
 */
export const readFilter = (code: string): FilterForm | null => {
  const match = FILTER.exec(code.trim());
  if (!match) return null;
  const [, output, input, params, condition] = match;
  const fields = params.split(",").map((name) => name.trim().replace(/^_/, "")).filter(Boolean);
  if (fields.length === 0 || fields.some((name) => !/^[A-Za-z_]\w*$/.test(name))) return null;
  const field = String.raw`((?:${fields.join("|")})(?:\.\w+)*)`;
  const base = { output, input, fields };
  const flag = new RegExp(`^(!?)${field}$`).exec(condition);
  if (flag) return { ...base, field: flag[2], comparison: flag[1] ? "isFalse" : "isTrue", value: "" };
  const compared = new RegExp(`^${field}\\s*(==|!=|>=|<=|>|<)\\s*(.+)$`).exec(condition);
  if (!compared) return null;
  const [, name, operator, literal] = compared;
  const quoted = /^'((?:[^'\\]|\\.)*)'$/.exec(literal.trim()) ?? /^"((?:[^"\\$]|\\.)*)"$/.exec(literal.trim());
  const number = /^-?\d+(\.\d+)?$/.test(literal.trim());
  if (!quoted && !number) return null;
  const comparison = (Object.entries(COMPARISONS) as Array<[Comparison, { operator?: string }]>).find(
    ([, entry]) => entry.operator === operator,
  )?.[0];
  if (!comparison) return null;
  return { ...base, field: name, comparison, value: quoted ? quoted[1].replace(/\\(.)/g, "$1") : literal.trim() };
};
