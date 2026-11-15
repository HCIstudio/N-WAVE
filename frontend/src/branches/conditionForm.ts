// A branch's condition as a form: a parameter, a comparison and a value, for
// the common case (`params.aligner == 'star'`, `params.depth > 10`,
// `!params.skip_qc`). Anything else stays code (Groovy), written as it is.

import { singleQuoted, type WorkflowParameterType } from "../registry/params";

export type Comparison = "is" | "isNot" | "gt" | "ge" | "lt" | "le" | "isTrue" | "isFalse";

export interface FormCondition {
  parameter: string;
  comparison: Comparison;
  /** The value compared with, as typed (empty for isTrue and isFalse). */
  value: string;
}

/** Each comparison: its label in the form, and its operator in the code. */
export const COMPARISONS: Record<Comparison, { label: string; operator?: string }> = {
  is: { label: "is", operator: "==" },
  isNot: { label: "is not", operator: "!=" },
  gt: { label: "is more than", operator: ">" },
  ge: { label: "is at least", operator: ">=" },
  lt: { label: "is less than", operator: "<" },
  le: { label: "is at most", operator: "<=" },
  isTrue: { label: "is on (true)" },
  isFalse: { label: "is off (false)" },
};

/** The comparisons that make sense for a parameter of this type. */
export const comparisonsFor = (type: WorkflowParameterType | undefined): Comparison[] => {
  if (type === "boolean") return ["isTrue", "isFalse"];
  if (type === "number") return ["is", "isNot", "gt", "ge", "lt", "le"];
  return ["is", "isNot"];
};

/** Whether a comparison takes a value. */
export const takesValue = (comparison: Comparison): boolean => comparison !== "isTrue" && comparison !== "isFalse";

const OPERATORS = Object.entries(COMPARISONS)
  .filter(([, entry]) => entry.operator)
  .map(([comparison, entry]) => [entry.operator as string, comparison as Comparison] as const);

/** A Groovy literal as typed in the form: a string's text, a number, true or false. */
const literalValue = (literal: string): { value: string; kind: "text" | "number" | "boolean" } | null => {
  const text = literal.trim();
  const quoted = /^'((?:[^'\\]|\\.)*)'$/.exec(text) ?? /^"((?:[^"\\$]|\\.)*)"$/.exec(text);
  if (quoted) return { value: quoted[1].replace(/\\(.)/g, "$1"), kind: "text" };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { value: text, kind: "number" };
  if (text === "true" || text === "false") return { value: text, kind: "boolean" };
  return null;
};

/** The form for a condition, or null when it is more than one comparison (code). */
export const readCondition = (condition: string): FormCondition | null => {
  const text = condition.trim();
  const flag = /^(!?)params\.([A-Za-z_]\w*)$/.exec(text);
  if (flag) return { parameter: flag[2], comparison: flag[1] ? "isFalse" : "isTrue", value: "" };
  const compared = /^params\.([A-Za-z_]\w*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(text);
  if (!compared) return null;
  const literal = literalValue(compared[3]);
  if (!literal) return null;
  const [, parameter, operator] = compared;
  if (literal.kind === "boolean") {
    if (operator !== "==" && operator !== "!=") return null;
    const on = (literal.value === "true") === (operator === "==");
    return { parameter, comparison: on ? "isTrue" : "isFalse", value: "" };
  }
  const comparison = OPERATORS.find(([op]) => op === operator)?.[1];
  return comparison ? { parameter, comparison, value: literal.value } : null;
};

/**
 * The condition the form says, for a parameter of `type`: text is quoted,
 * numbers aren't. Null while it is incomplete (no parameter, or no value).
 */
export const writeCondition = (form: FormCondition, type: WorkflowParameterType | undefined): string | null => {
  if (!form.parameter) return null;
  const param = `params.${form.parameter}`;
  if (form.comparison === "isTrue") return param;
  if (form.comparison === "isFalse") return `!${param}`;
  const value = form.value.trim();
  if (!value) return null;
  const literal = type === "number" && /^-?\d+(\.\d+)?$/.test(value) ? value : singleQuoted(form.value);
  return `${param} ${COMPARISONS[form.comparison].operator} ${literal}`;
};
