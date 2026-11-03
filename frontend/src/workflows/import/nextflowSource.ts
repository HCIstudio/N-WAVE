// Reading the structure of a Nextflow script: where its strings and comments
// are, which bracket closes which, its top-level parts (params, includes,
// processes, workflows, functions, other code) and the statements of a
// workflow. Not a full Groovy parser: enough to find every part reliably,
// with the code of each part kept exactly as written.

/**
 * The text with the contents of comments and strings blanked (spaces), so
 * brackets, keywords and names found in it are code. Same length and lines.
 * Quotes stay; `${...}` in double-quoted strings is blanked too, unless
 * `keepInterpolations` is set (for finding the names code reads).
 */
export const maskSource = (text: string, { keepInterpolations = false } = {}): string => {
  const out = text.split("");
  /** Code inside strings (`${x}`, `$x`), shown again when keepInterpolations is set. */
  const interpolations: Array<[number, number]> = [];
  // Comments keep their line breaks; strings don't, so a multi-line string
  // never looks like the end of a statement.
  const blank = (from: number, to: number, keepLines = true) => {
    for (let index = from; index < to; index += 1) if (!keepLines || out[index] !== "\n") out[index] = " ";
  };
  let index = 0;
  // The last code character before index (for telling `/` apart).
  let previous = "";

  const scanString = (start: number, quote: string): number => {
    // Returns the index after the closing quote.
    const triple = text.startsWith(quote.repeat(3), start);
    const close = triple ? quote.repeat(3) : quote;
    let position = start + close.length;
    const interpolates = quote === '"' || quote === "/";
    while (position < text.length) {
      const char = text[position];
      if (char === "\\" && quote !== "/") {
        position += 2;
        continue;
      }
      if (quote === "/" && char === "\\" && text[position + 1] === "/") {
        position += 2;
        continue;
      }
      if (!triple && quote !== "/" && char === "\n") return position; // unterminated: stop at line end
      if (interpolates && char === "$" && text[position + 1] === "{") {
        const end = scanCode(position + 2, "}");
        interpolations.push([position + 2, end - 1]);
        position = end;
        continue;
      }
      if (interpolates && quote !== "/" && char === "$" && /[A-Za-z_]/.test(text[position + 1] ?? "")) {
        const name = text.slice(position + 1).match(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/)?.[0] ?? "";
        interpolations.push([position + 1, position + 1 + name.length]);
        position += 1 + name.length;
        continue;
      }
      if (text.startsWith(close, position)) return position + close.length;
      position += 1;
    }
    return position;
  };

  // Scan code until the matching `end` bracket (or the end); returns the index after it.
  const scanCode = (start: number, end: string | null): number => {
    let position = start;
    let depth = 0;
    while (position < text.length) {
      const char = text[position];
      const next = text[position + 1];
      if (char === "/" && next === "/") {
        const lineEnd = text.indexOf("\n", position);
        position = lineEnd === -1 ? text.length : lineEnd;
        continue;
      }
      if (char === "/" && next === "*") {
        const close = text.indexOf("*/", position + 2);
        position = close === -1 ? text.length : close + 2;
        continue;
      }
      if (char === "'" || char === '"') {
        position = scanString(position, char);
        previous = char;
        continue;
      }
      if (char === "$" && next === "/") {
        const close = text.indexOf("/$", position + 2);
        position = close === -1 ? text.length : close + 2;
        previous = "/";
        continue;
      }
      if (char === "/" && /^$|[(,=~!&|[{:?;+\-*%<>^\n]$/.test(previous) && next !== " " && next !== "=") {
        position = scanString(position, "/");
        previous = "/";
        continue;
      }
      if (end && (char === "{" || char === "(" || char === "[")) depth += 1;
      if (end && (char === "}" || char === ")" || char === "]")) {
        if (depth === 0 && char === end) return position + 1;
        depth -= 1;
      }
      if (!/\s/.test(char)) previous = /\w/.test(char) ? (isKeywordEnd(text, position) ? "=" : "a") : char;
      else if (char === "\n" && previous !== "") previous = previous === "a" || previous === ")" || previous === "]" || previous === "}" ? "\n" : previous;
      position += 1;
    }
    return position;
  };

  // A word like `return` lets a regex follow it.
  const isKeywordEnd = (source: string, position: number): boolean => {
    if (/\w/.test(source[position + 1] ?? "")) return false;
    const word = source.slice(Math.max(0, position - 5), position + 1);
    return /(^|\W)return$/.test(word);
  };

  // Walk the whole text once, blanking what isn't code.
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "/" && next === "/") {
      const lineEnd = text.indexOf("\n", index);
      const end = lineEnd === -1 ? text.length : lineEnd;
      blank(index + 2, end);
      index = end;
      continue;
    }
    if (char === "/" && next === "*") {
      const close = text.indexOf("*/", index + 2);
      const end = close === -1 ? text.length : close + 2;
      blank(index + 2, Math.max(index + 2, end - 2));
      index = end;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = scanString(index, char);
      const quoteLength = text.startsWith(char.repeat(3), index) ? 3 : 1;
      blank(index + quoteLength, Math.max(index + quoteLength, end - quoteLength), false);
      index = end;
      previous = char;
      continue;
    }
    if (char === "$" && next === "/") {
      const close = text.indexOf("/$", index + 2);
      const end = close === -1 ? text.length : close + 2;
      blank(index + 2, Math.max(index + 2, end - 2), false);
      index = end;
      previous = "/";
      continue;
    }
    if (char === "/" && /^$|[(,=~!&|[{:?;+\-*%<>^\n]$/.test(previous) && next !== " " && next !== "=") {
      const end = scanString(index, "/");
      blank(index + 1, Math.max(index + 1, end - 1), false);
      index = end;
      previous = "/";
      continue;
    }
    if (!/\s/.test(char)) previous = /\w/.test(char) ? (isKeywordEnd(text, index) ? "=" : "a") : char;
    else if (char === "\n") previous = previous === "" ? "" : "\n";
    index += 1;
  }
  if (keepInterpolations) {
    for (const [from, to] of interpolations) {
      const code = maskSource(text.slice(from, to), { keepInterpolations });
      for (let position = from; position < to; position += 1) out[position] = code[position - from];
    }
  }
  return out.join("");
};

/** The index of the bracket that closes the one at `open` (in masked text), or -1. */
export const closingBracket = (masked: string, open: number): number => {
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const stack: string[] = [];
  for (let index = open; index < masked.length; index += 1) {
    const char = masked[index];
    if (pairs[char]) stack.push(pairs[char]);
    else if (char === "}" || char === ")" || char === "]") {
      if (stack.pop() !== char) return -1;
      if (stack.length === 0) return index;
    }
  }
  return -1;
};

export type TopLevelKind =
  | "params"
  | "include"
  | "process"
  | "workflow"
  | "function"
  | "config"
  | "enable"
  | "output"
  | "other";

export interface TopLevelItem {
  kind: TopLevelKind;
  /** Process, workflow (empty for the entry workflow) or function name; param name. */
  name: string;
  /** The code as written, without the comments before it. */
  text: string;
  /** The `//` and `/* *\/` comments right before it, as written. */
  comments: string[];
  start: number;
  end: number;
}

/** Where the statement starting at `start` (masked text, top level) ends. */
const statementEnd = (masked: string, start: number): number => {
  let index = start;
  let depth = 0;
  while (index < masked.length) {
    const char = masked[index];
    if (char === "{" || char === "(" || char === "[") depth += 1;
    else if (char === "}" || char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if ((char === "\n" || char === ";") && depth === 0) {
      const rest = masked.slice(index + 1);
      const nextLine = rest.match(/^[ \t\r\n]*([^\n]*)/)?.[1] ?? "";
      const before = masked.slice(start, index).trimEnd();
      // A line that goes on: `.map {…}`, an operator at the end of this one.
      if (char === "\n" && (/^(\.|\?|:|\+|\|\||&&|\||\*|-(?!>))/.test(nextLine) || /[=+.,(|&?:*-]$/.test(before))) {
        index += 1;
        continue;
      }
      return index;
    }
    index += 1;
  }
  return index;
};

/** The comments right before `start` (only blank lines between them and it). */
const leadingComments = (text: string, masked: string, from: number, start: number): { comments: string[]; at: number } => {
  const comments: string[] = [];
  let at = start;
  // Walk back over whitespace and comments.
  const region = text.slice(from, start);
  const maskedRegion = masked.slice(from, start);
  const pieces: Array<{ text: string; offset: number }> = [];
  const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  for (const match of region.matchAll(pattern)) {
    // Only real comments (masked text keeps their slashes).
    if (maskedRegion.slice(match.index ?? 0, (match.index ?? 0) + 2) !== match[0].slice(0, 2)) continue;
    pieces.push({ text: match[0], offset: from + (match.index ?? 0) });
  }
  // Keep the run of comments that only whitespace separates from the item.
  let cursor = start;
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    const piece = pieces[index];
    const between = text.slice(piece.offset + piece.text.length, cursor);
    if (between.trim() !== "" || /\n\s*\n/.test(between)) break;
    comments.unshift(piece.text);
    cursor = piece.offset;
    at = piece.offset;
  }
  return { comments, at };
};

/** The parts of a script at its top level, in order. */
export const topLevelItems = (text: string): TopLevelItem[] => {
  const masked = maskSource(text);
  const items: TopLevelItem[] = [];
  let index = 0;
  let lastEnd = 0;
  while (index < masked.length) {
    // Skip whitespace and comments (masked comments are blank).
    const rest = masked.slice(index);
    const lead = rest.match(/^(\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/);
    if (lead) {
      index += lead[0].length;
      continue;
    }
    const start = index;
    const head = masked.slice(start, start + 400);
    let kind: TopLevelKind = "other";
    let name = "";
    let end: number;
    const block = (open: number) => {
      const close = closingBracket(masked, open);
      return close === -1 ? masked.length : close + 1;
    };
    const process = head.match(/^process\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
    const workflow = head.match(/^workflow(?:\s+([A-Za-z_][A-Za-z0-9_]*))?\s*\{/);
    const output = head.match(/^output\s*\{/);
    const include = head.match(/^include\s*\{/);
    const fn = head.match(/^def\s+(?:[A-Za-z_][\w<>,\s]*\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/);
    const param = head.match(/^params\.([A-Za-z_][A-Za-z0-9_.]*)\s*=(?!=)/);
    if (process) {
      kind = "process";
      name = process[1];
      end = block(start + process[0].length - 1);
    } else if (workflow) {
      kind = "workflow";
      name = workflow[1] ?? "";
      end = block(start + workflow[0].length - 1);
    } else if (output) {
      kind = "output";
      end = block(start + output[0].length - 1);
    } else if (include) {
      kind = "include";
      end = statementEnd(masked, start);
    } else if (fn) {
      kind = "function";
      name = fn[1];
      end = block(start + fn[0].length - 1);
    } else if (param) {
      kind = "params";
      name = param[1];
      end = statementEnd(masked, start);
    } else if (/^nextflow\.(enable|preview)\./.test(head)) {
      kind = "enable";
      end = statementEnd(masked, start);
    } else {
      // `workflow.onComplete { … }` and the like run as they are.
      end = statementEnd(masked, start);
    }
    if (end <= start) end = start + 1;
    const { comments, at } = leadingComments(text, masked, lastEnd, start);
    items.push({ kind, name, text: text.slice(start, end).trim(), comments, start: at, end });
    index = end;
    lastEnd = end;
  }
  return items;
};

/** The N-WAVE config comment's content (`params { … } process { … }`), or "". */
export const embeddedConfig = (text: string): string => {
  const match = text.match(/\/\*\s*N-WAVE_NEXTFLOW_CONFIG\s*([\s\S]*?)\*\//);
  return match ? match[1].replace(/\*\\\//g, "*/").trim() : "";
};

export interface WorkflowSections {
  take: string;
  main: string;
  emit: string;
  publish: string;
  onComplete: string;
  onError: string;
}

/** take:, main:, emit:, publish:, onComplete: and onError: of a workflow block's body (main: is all when there are none). */
export const workflowSections = (body: string): WorkflowSections => {
  const masked = maskSource(body);
  const label = /(^|\n)[ \t]*(take|main|emit|publish|onComplete|onError)\s*:/g;
  const marks = [...masked.matchAll(label)].map((match) => ({
    name: match[2],
    start: (match.index ?? 0) + match[0].length,
    at: match.index ?? 0,
  }));
  if (marks.length === 0) return { take: "", main: body, emit: "", publish: "", onComplete: "", onError: "" };
  const part = (name: string) => {
    const index = marks.findIndex((mark) => mark.name === name);
    if (index === -1) return "";
    return body.slice(marks[index].start, marks[index + 1]?.at ?? body.length);
  };
  return {
    take: part("take"),
    main: part("main"),
    emit: part("emit"),
    publish: part("publish"),
    onComplete: part("onComplete"),
    onError: part("onError"),
  };
};

/** The body of a `name { … }` block (process, workflow), without the braces. */
export const blockBody = (blockText: string): string => {
  const masked = maskSource(blockText);
  const open = masked.indexOf("{");
  const close = open === -1 ? -1 : closingBracket(masked, open);
  return open === -1 ? "" : blockText.slice(open + 1, close === -1 ? blockText.length : close);
};

export interface Statement {
  /** The code as written (several lines for chains and blocks). */
  text: string;
  /** Its first line's indentation: later lines are indented from there. */
  column: number;
  /** A blank line separates it from the statement before. */
  blankBefore?: boolean;
  /** Comments right before it. */
  comments: string[];
}

/**
 * The statements of a workflow's main: section, each with the comments
 * before it. `if`/`else` blocks stay whole, as one statement.
 */
export const splitWorkflowStatements = (main: string): Statement[] => {
  const masked = maskSource(main);
  const statements: Statement[] = [];
  let index = 0;
  let lastEnd = 0;
  while (index < masked.length) {
    const lead = masked.slice(index).match(/^(\s|;|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/);
    if (lead) {
      index += lead[0].length;
      continue;
    }
    const start = index;
    let end = statementEnd(masked, start);
    // `if (…) { … } else { … }`, `try { … } catch …`: the whole chain.
    if (/^(if|for|while|try)\b/.test(masked.slice(start, start + 6))) {
      let cursor = start;
      for (;;) {
        const open = masked.indexOf("{", cursor);
        if (open === -1) break;
        const close = closingBracket(masked, open);
        if (close === -1) {
          cursor = masked.length;
          break;
        }
        cursor = close + 1;
        const after = masked.slice(cursor).match(/^\s*(else\s+if\b[^{]*|else|catch\s*\([^)]*\)|finally)\s*\{/);
        if (!after) break;
        cursor += after[0].length - 1;
      }
      end = Math.max(end, cursor);
    }
    if (end <= start) end = start + 1;
    const { comments } = leadingComments(main, masked, lastEnd, start);
    const text = main.slice(start, end).trim();
    const column = start - (main.lastIndexOf("\n", start - 1) + 1);
    // From the end of the last statement to this one (and its comments).
    const gapEnd = comments.length > 0 ? main.lastIndexOf(comments[0], start) : start;
    const blankBefore = /\n[ \t]*\n/.test(main.slice(lastEnd, gapEnd));
    if (text) statements.push({ text, comments, column, blankBefore });
    index = end;
    lastEnd = end;
  }
  return statements;
};

/** `include { A; B as C } from 'path'`: [process name, name in this script, path]. */
export const readIncludeItem = (text: string): Array<{ name: string; alias: string; path: string }> => {
  const match = text.match(/include\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/);
  if (!match) return [];
  return match[1]
    .split(/[;\n]/)
    .map((part) => part.trim().match(/^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/))
    .filter((names): names is RegExpMatchArray => names !== null)
    .map((names) => ({ name: names[1], alias: names[2] ?? names[1], path: match[2] }));
};

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/g;

/** Variables a statement defines: `x = …`, `(a, b) = …`, `.set { x }`. */
export const definedNames = (statement: string): string[] => {
  const masked = maskSource(statement);
  const names: string[] = [];
  const single = masked.match(/^\s*(?:def\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/);
  if (single) names.push(single[1]);
  const tuple = masked.match(/^\s*(?:def\s+)?\(([^)]*)\)\s*=(?!=)/);
  if (tuple) names.push(...tuple[1].split(",").map((name) => name.trim()).filter((name) => /^\w+$/.test(name)));
  for (const set of masked.matchAll(/\.set\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g)) names.push(set[1]);
  return [...new Set(names)];
};

/**
 * Names a statement reads that `known` holds (channels defined before), and
 * the steps whose outputs it reads (`STEP.out`, `STEP.out.reads`).
 */
export const usedNames = (
  statement: string,
  known: Set<string>,
): { variables: string[]; outputs: Array<{ step: string; emit: string | null; text: string }> } => {
  const masked = maskSource(statement, { keepInterpolations: true });
  const variables = new Set<string>();
  const outputs: Array<{ step: string; emit: string | null; text: string }> = [];
  for (const match of masked.matchAll(/(?<![.\w])([A-Za-z_][A-Za-z0-9_]*)\.out(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\])?(?!\w)/g)) {
    outputs.push({ step: match[1], emit: match[2] ?? (match[3] !== undefined ? `[${match[3]}]` : null), text: match[0] });
  }
  for (const match of masked.matchAll(IDENTIFIER)) {
    const name = match[0];
    const before = masked[(match.index ?? 0) - 1] ?? "";
    if (before === "." || !known.has(name)) continue;
    variables.add(name);
  }
  return { variables: [...variables], outputs };
};
