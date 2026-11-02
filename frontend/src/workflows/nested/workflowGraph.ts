// The steps inside an nf-core subworkflow or pipeline, read from its
// main.nf: which modules and subworkflows its workflow calls, and which call
// feeds which (through `X.out` and the channels made from it). A read-only
// sketch for the nested view, not a Nextflow parser: what it can't follow
// (e.g. channels built in a function) just has no connection.

export type StepKind = "module" | "subworkflow" | "workflow";

export interface WorkflowStep {
  /** The name the workflow calls it by (an include's alias). */
  id: string;
  kind: StepKind;
  /** The include path, e.g. "../../subworkflows/local/align_star". */
  include?: string;
  /** Position among the calls, from the top of the workflow. */
  order: number;
}

export interface WorkflowGraph {
  /** The workflow read, e.g. "RNASEQ". */
  name: string;
  steps: WorkflowStep[];
  /** Step ids; "input" and "output" for the workflow's take: and emit:. */
  edges: { source: string; target: string }[];
  inputs: string[];
  outputs: string[];
}

export const INPUT_NODE = "input";
export const OUTPUT_NODE = "output";

/** Comments out, string contents kept (paths in includes). */
export const stripComments = (text: string): string => {
  let out = "";
  let index = 0;
  let quote: string | null = null;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (quote) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      out += char;
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      const skipped = text.slice(index, end === -1 ? text.length : end + 2);
      out += skipped.replace(/[^\n]/g, "");
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
};

interface Include {
  name: string;
  path: string;
  kind: StepKind;
}

/** Under modules/: a process; a pipeline's workflows/: its main workflow; anything else a subworkflow. */
const includeKind = (path: string): StepKind | null => {
  if (path.startsWith("plugin/")) return null;
  if (/(^|\/)modules\//.test(path)) return "module";
  if (/(^|\/)workflows\//.test(path) && !/subworkflows\//.test(path)) return "workflow";
  return "subworkflow";
};

/** `include { A; B as C } from '...'`: callable names (processes and workflows, upper case). */
export const readIncludes = (text: string): Map<string, Include> => {
  const includes = new Map<string, Include>();
  for (const match of text.matchAll(/include\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const path = match[2];
    const kind = includeKind(path);
    if (!kind) continue;
    for (const part of match[1].split(/[;\n]/)) {
      const names = part.trim().match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (!names) continue;
      const name = names[2] ?? names[1];
      // Functions (lower case) are not steps.
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue;
      includes.set(name, { name, path, kind });
    }
  }
  return includes;
};

/** The text between the brace at `open` and its match. */
const braceBody = (text: string, open: number): string => {
  let depth = 0;
  let quote: string | null = null;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, index);
    }
  }
  return text.slice(open + 1);
};

/** The workflow's body: the named one, else the first named one, else the entry workflow. */
const workflowBody = (text: string, name?: string): { name: string; body: string } | null => {
  const blocks = [...text.matchAll(/(^|\n)\s*workflow\s+(\w+)?\s*\{/g)];
  const pick =
    blocks.find((block) => name && block[2] === name) ??
    blocks.find((block) => block[2]) ??
    blocks[0];
  if (!pick || pick.index === undefined) return null;
  const open = pick.index + pick[0].length - 1;
  return { name: pick[2] ?? "", body: braceBody(text, open) };
};

/** take:, main: and emit: of a workflow body (main: is all when there are none). */
const sections = (body: string): { take: string; main: string; emit: string } => {
  const label = /(^|\n)\s*(take|main|emit|publish)\s*:/g;
  const marks = [...body.matchAll(label)].map((match) => ({
    name: match[2],
    start: (match.index ?? 0) + match[0].length,
    at: match.index ?? 0,
  }));
  if (marks.length === 0) return { take: "", main: body, emit: "" };
  const part = (name: string) => {
    const index = marks.findIndex((mark) => mark.name === name);
    if (index === -1) return "";
    return body.slice(marks[index].start, marks[index + 1]?.at ?? body.length);
  };
  return { take: part("take"), main: part("main"), emit: part("emit") };
};

const CONTINUES = /^\s*(\.|\?|:|\+|\|\||&&|\|)/;
const BLOCK_KEYWORDS = new Set(["if", "for", "while", "switch"]);

/**
 * Statements at the top of a block: split at line ends outside parentheses,
 * brackets and closures, unless the next line goes on (`.map {…}`). Blocks
 * (`if (…) {`, `else {`) only separate statements.
 */
export const splitStatements = (text: string): string[] => {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  // For each open brace: is it a closure (counts) or a block (doesn't)?
  const braces: boolean[] = [];
  let quote: string | null = null;
  let lastParenKeyword = false;
  const parenKeywords: boolean[] = [];
  const flush = () => {
    if (current.trim()) statements.push(current.trim());
    current = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === "\\") {
        current += text[index + 1] ?? "";
        index += 1;
      } else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") {
      const before = current.match(/(\w+)\s*$/)?.[1] ?? "";
      parenKeywords.push(depth === 0 && BLOCK_KEYWORDS.has(before));
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      lastParenKeyword = parenKeywords.pop() ?? false;
      current += char;
      continue;
    }
    if (char === "[") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === "]") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }
    if (char === "{") {
      const trimmed = current.trimEnd();
      const isBlock =
        depth === 0 && ((trimmed.endsWith(")") && lastParenKeyword) || /\b(else|try|finally)$/.test(trimmed));
      braces.push(!isBlock);
      if (isBlock) {
        // `if (cond) {`: the condition is no statement of its own.
        current = "";
        continue;
      }
      depth += 1;
      current += char;
      continue;
    }
    if (char === "}") {
      const closure = braces.pop() ?? false;
      if (closure) {
        depth = Math.max(0, depth - 1);
        current += char;
      } else {
        flush();
      }
      continue;
    }
    if ((char === "\n" || char === ";") && depth === 0) {
      const rest = text.slice(index + 1);
      const nextLine = rest.match(/^\s*([^\n]*)/)?.[1] ?? "";
      if (char === "\n" && (CONTINUES.test(nextLine) || /[=+.,(|&?:]\s*$/.test(current))) {
        current += char;
        continue;
      }
      flush();
      continue;
    }
    current += char;
  }
  flush();
  return statements;
};

/** Version channels go everywhere and say nothing about the flow of data. */
const isVersions = (name: string) => /versions/i.test(name);

/** Reads a workflow's steps and how they connect from its main.nf. */
export const parseWorkflowGraph = (source: string, workflowName?: string): WorkflowGraph => {
  const text = stripComments(source);
  const includes = readIncludes(text);
  const found = workflowBody(text, workflowName);
  const name = found?.name || workflowName || "workflow";
  if (!found) return { name, steps: [], edges: [], inputs: [], outputs: [] };
  const { take, main, emit } = sections(found.body);

  const inputs = take
    .split("\n")
    .map((line) => line.trim().match(/^(\w+)/)?.[1])
    .filter((input): input is string => Boolean(input));
  // What each name stands for: the steps (and inputs) its data comes from.
  const sources = new Map<string, Set<string>>(inputs.map((input) => [input, new Set([INPUT_NODE])]));
  const steps = new Map<string, WorkflowStep>();
  const edges = new Map<string, { source: string; target: string }>();

  const callables = [...includes.keys()].sort((a, b) => b.length - a.length);
  const referencesIn = (expression: string): Set<string> => {
    const found = new Set<string>();
    for (const callable of callables) {
      // `X.out.y`, or `X` itself (`ch = X`, then `ch.out.y`), but not a call `X (…)`.
      const reference = new RegExp(`(^|[^\\w.])${callable}\\b(?!\\s*\\()(\\.out\\.(\\w+))?`, "g");
      for (const match of expression.matchAll(reference)) {
        if (match[3] && isVersions(match[3])) continue;
        found.add(callable);
      }
    }
    for (const word of expression.matchAll(/\b([a-z_]\w*)\b/g)) {
      const known = sources.get(word[1]);
      if (known && !isVersions(word[1])) for (const item of known) found.add(item);
    }
    return found;
  };

  for (const statement of splitStatements(main)) {
    // Calls: `NAME (args)` and `NAME(args)`, not `NAME.out`.
    for (const callable of callables) {
      const call = new RegExp(`(^|[^\\w.])${callable}\\s*\\(`, "g");
      for (const match of statement.matchAll(call)) {
        const start = (match.index ?? 0) + match[0].length;
        let depth = 1;
        let end = start;
        while (end < statement.length && depth > 0) {
          if (statement[end] === "(") depth += 1;
          else if (statement[end] === ")") depth -= 1;
          end += 1;
        }
        const include = includes.get(callable);
        if (!steps.has(callable) && include) {
          steps.set(callable, { id: callable, kind: include.kind, include: include.path, order: steps.size });
        }
        for (const from of referencesIn(statement.slice(start, end - 1))) {
          if (from === callable) continue;
          edges.set(`${from}->${callable}`, { source: from, target: callable });
        }
      }
    }
    // `….set { name }` names a channel too.
    const named = statement.match(/\.set\s*\{\s*(\w+)\s*\}\s*$/);
    if (named && !isVersions(named[1])) {
      sources.set(named[1], referencesIn(statement.slice(0, named.index)));
    }
    // Assignments: `name = …` (also `name = name.mix(…)`, which adds to it).
    const assignment = statement.match(/^(\w+)\s*=(?!=)([\s\S]*)$/);
    if (assignment && !isVersions(assignment[1])) {
      const [, target, expression] = assignment;
      const before = sources.get(target) ?? new Set<string>();
      sources.set(target, new Set([...before, ...referencesIn(expression)]));
    }
  }

  const outputs: string[] = [];
  for (const statement of splitStatements(emit)) {
    const output = statement.match(/^(\w+)\s*=([\s\S]*)$/);
    if (!output || isVersions(output[1])) continue;
    outputs.push(output[1]);
    for (const from of referencesIn(output[2])) {
      edges.set(`${from}->${OUTPUT_NODE}`, { source: from, target: OUTPUT_NODE });
    }
  }

  const known = new Set([...steps.keys(), INPUT_NODE, OUTPUT_NODE]);
  return {
    name,
    steps: [...steps.values()],
    edges: [...edges.values()].filter(
      (edge) => known.has(edge.source) && known.has(edge.target) && (edge.source !== INPUT_NODE || inputs.length > 0),
    ),
    inputs,
    outputs,
  };
};
