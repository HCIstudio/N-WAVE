// When a step runs: the conditions BioFlow-Insight finds around each call
// (`if (params.aligner == 'star')`, the `else` of it), and whether they hold
// with the Parameters node's values: a preview, evaluated in the browser.
//
// Conditions are Groovy expressions. N-WAVE evaluates `params.x`, literals
// (strings, numbers, true, false, null), `!`, `&&`, `||`, comparisons and
// parentheses; anything else (a function, a value computed at run time) and
// params the Parameters node doesn't set can't be told, and grey nothing out.

import type { Node } from "@xyflow/react";
import type { NodeData } from "../components/nodes/BaseNode";
import { getNodeParameters } from "../registry/params";
import type { BioflowResult } from "./bioflow";

type Value = string | number | boolean | null;
/** A value, or unknown (can't be told before the run). */
type Maybe = { known: true; value: Value } | { known: false };

const UNKNOWN: Maybe = { known: false };
const known = (value: Value): Maybe => ({ known: true, value });

/** Groovy truth: false, null, 0 and "" are false. */
const truthy = (value: Value): boolean => value !== false && value !== null && value !== 0 && value !== "";

type Token =
  | { type: "param"; name: string }
  | { type: "literal"; value: Value }
  | { type: "op"; op: string }
  | { type: "paren"; open: boolean };

const tokenize = (text: string): Token[] | null => {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    const space = rest.match(/^\s+/);
    if (space) {
      index += space[0].length;
      continue;
    }
    const param = rest.match(/^params\.([A-Za-z_]\w*)(?![\w.(])/);
    if (param) {
      tokens.push({ type: "param", name: param[1] });
      index += param[0].length;
      continue;
    }
    const string = rest.match(/^'((?:[^'\\]|\\.)*)'|^"((?:[^"\\$]|\\.)*)"/);
    if (string) {
      tokens.push({ type: "literal", value: (string[1] ?? string[2] ?? "").replace(/\\(.)/g, "$1") });
      index += string[0].length;
      continue;
    }
    const number = rest.match(/^-?\d+(\.\d+)?(?![\w.])/);
    if (number) {
      tokens.push({ type: "literal", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const word = rest.match(/^(true|false|null)(?!\w)/);
    if (word) {
      tokens.push({ type: "literal", value: word[1] === "true" ? true : word[1] === "false" ? false : null });
      index += word[0].length;
      continue;
    }
    const op = rest.match(/^(&&|\|\||==|!=|<=|>=|<|>|!)/);
    if (op) {
      tokens.push({ type: "op", op: op[1] });
      index += op[0].length;
      continue;
    }
    if (rest[0] === "(" || rest[0] === ")") {
      tokens.push({ type: "paren", open: rest[0] === "(" });
      index += 1;
      continue;
    }
    // Anything else: a method call, a variable, a ternary...
    return null;
  }
  return tokens;
};

/** A comparison, or null when the values are of different kinds (Groovy's rules differ by case). */
const compare = (op: string, left: Value, right: Value): boolean | null => {
  if (op === "==" || op === "!=") {
    if (left !== null && right !== null && typeof left !== typeof right) return null;
    return (left === right) === (op === "==");
  }
  if (left === null || right === null || typeof left !== typeof right) return null;
  if (op === "<") return left < right;
  if (op === ">") return left > right;
  if (op === "<=") return left <= right;
  return left >= right;
};

/**
 * Evaluate a condition: true, false, or null when it can't be told. A
 * parser for `or := and ('||' and)*; and := not ('&&' not)*;
 * not := '!' not | compare; compare := atom (op atom)?; atom := param | literal | '(' or ')'`.
 */
export const evaluateCondition = (text: string, params: Map<string, Value>): boolean | null => {
  const tokens = tokenize(text);
  if (!tokens || tokens.length === 0) return null;
  let position = 0;
  let failed = false;
  const peek = () => tokens[position];
  const isOp = (op: string) => {
    const token = peek();
    return token?.type === "op" && token.op === op;
  };

  const atom = (): Maybe => {
    const token = tokens[position];
    position += 1;
    if (!token) {
      failed = true;
      return UNKNOWN;
    }
    if (token.type === "param") return params.has(token.name) ? known(params.get(token.name) ?? null) : UNKNOWN;
    if (token.type === "literal") return known(token.value);
    if (token.type === "paren" && token.open) {
      const inner = or();
      const close = tokens[position];
      if (close?.type !== "paren" || close.open) failed = true;
      position += 1;
      return inner;
    }
    failed = true;
    return UNKNOWN;
  };
  const comparison = (): Maybe => {
    const left = atom();
    const token = peek();
    if (token?.type === "op" && ["==", "!=", "<", ">", "<=", ">="].includes(token.op)) {
      position += 1;
      const right = atom();
      if (!left.known || !right.known) return UNKNOWN;
      const compared = compare(token.op, left.value, right.value);
      return compared === null ? UNKNOWN : known(compared);
    }
    return left;
  };
  const not = (): Maybe => {
    if (isOp("!")) {
      position += 1;
      const inner = not();
      return inner.known ? known(!truthy(inner.value)) : UNKNOWN;
    }
    return comparison();
  };
  const and = (): Maybe => {
    let result = not();
    while (isOp("&&")) {
      position += 1;
      const right = not();
      // false && unknown is false.
      if (result.known && !truthy(result.value)) continue;
      if (right.known && !truthy(right.value)) result = known(false);
      else result = result.known && right.known ? known(true) : UNKNOWN;
    }
    return result;
  };
  const or = (): Maybe => {
    let result = and();
    while (isOp("||")) {
      position += 1;
      const right = and();
      if (result.known && truthy(result.value)) continue;
      if (right.known && truthy(right.value)) result = known(true);
      else result = result.known && right.known ? known(false) : UNKNOWN;
    }
    return result;
  };

  const result = or();
  if (failed || position !== tokens.length || !result.known) return null;
  return truthy(result.value);
};

/** The Parameters nodes' values, by name, as Nextflow sees them. */
export const parameterValues = (nodes: Node<NodeData>[]): Map<string, Value> => {
  const values = new Map<string, Value>();
  for (const node of nodes) {
    if (node.type !== "parameters") continue;
    for (const parameter of getNodeParameters(node.data as Record<string, unknown>)) {
      const raw = String(parameter.value ?? "");
      if (parameter.type === "boolean") values.set(parameter.name, raw === "true");
      else if (parameter.type === "number") values.set(parameter.name, raw.trim() === "" || Number.isNaN(Number(raw)) ? null : Number(raw));
      else values.set(parameter.name, raw);
    }
  }
  return values;
};

export interface NodeConditions {
  /** Each condition the step runs under, and whether it holds now (null: can't tell). */
  conditions: Array<{ text: string; holds: boolean | null }>;
  /** false when a condition doesn't hold: the step won't run with these values. */
  runs: boolean | null;
}

/**
 * The conditions of each canvas node: a step's own, or, for a subworkflow
 * node, those all its steps share. `names` is each node's name in the
 * analysed script.
 */
export const conditionsByNode = (result: BioflowResult, names: Map<string, string>): Map<string, string[]> => {
  const byName = new Map<string, string>();
  for (const [nodeId, name] of names) if (!byName.has(name)) byName.set(name, nodeId);
  const subworkflowName = new Map(result.subworkflows.map((sub) => [sub.id, sub.name]));
  const perNode = new Map<string, string[][]>();
  for (const step of result.steps) {
    const top = step.subworkflow ? (subworkflowName.get(step.id.split(".")[0] ?? "") ?? "") : step.name;
    const nodeId = byName.get(top);
    if (!nodeId) continue;
    perNode.set(nodeId, [...(perNode.get(nodeId) ?? []), step.conditions]);
  }
  const shared = new Map<string, string[]>();
  for (const [nodeId, lists] of perNode) {
    const common = lists.reduce((all, list) => all.filter((condition) => list.includes(condition)));
    if (common.length > 0) shared.set(nodeId, common);
  }
  return shared;
};

/** The preview: every node's conditions, evaluated with the Parameters node's values. */
export const previewConditions = (byNode: Map<string, string[]>, params: Map<string, Value>): Record<string, NodeConditions> => {
  const preview: Record<string, NodeConditions> = {};
  for (const [nodeId, texts] of byNode) {
    const conditions = texts.map((text) => ({ text, holds: evaluateCondition(text, params) }));
    const runs = conditions.some((entry) => entry.holds === false) ? false : conditions.every((entry) => entry.holds === true) ? true : null;
    preview[nodeId] = { conditions, runs };
  }
  return preview;
};
