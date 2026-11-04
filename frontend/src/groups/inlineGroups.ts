// Importing a script N-WAVE wrote with groups (#221): each group's workflow
// is written back into the entry workflow where it is called, so its steps
// import as nodes of their own, then marked with their group again. Which
// workflows are groups the layout line says (`FASTQC 380,80 "FastQC" @READ_QC`);
// any other named workflow imports as before, as one custom node.

import { parseLayoutComment } from "../generators/core/layoutComment";
import {
  blockBody,
  maskSource,
  readIncludeItem,
  topLevelItems,
  workflowSections,
} from "../workflows/import/nextflowSource";
import { directoryOf, normalizePath, relativePath } from "../workflows/import/projectPaths";

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace a name in code, not in its strings or comments. */
const replaceName = (code: string, name: string, replacement: (match: string) => string): string => {
  const masked = maskSource(code);
  const pattern = new RegExp(`(?<![.\\w$])${escapeRegExp(name)}(?![\\w$])`, "g");
  let result = "";
  let last = 0;
  for (const match of masked.matchAll(pattern)) {
    const at = match.index ?? 0;
    result += code.slice(last, at) + replacement(code.slice(at, at + match[0].length));
    last = at + match[0].length;
  }
  return result + code.slice(last);
};

/** The arguments of a call's text, split at its top-level commas. */
const splitArguments = (text: string): string[] => {
  const masked = maskSource(text);
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < masked.length; index += 1) {
    const char = masked[index];
    if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (text.slice(start).trim()) parts.push(text.slice(start).trim());
  return parts;
};

/** The `name` of each line of a take: section (comments left out). */
const takeNames = (take: string): string[] =>
  maskSource(take)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z_]\w*$/.test(line));

/** `name = expression` lines of an emit: section, in order. */
const emitEntries = (emit: string): Array<{ name: string; expression: string }> =>
  emit.split("\n").flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/);
    return match ? [{ name: match[1], expression: match[2] }] : [];
  });

/**
 * A project keeps each group in subworkflows/local/<name>/main.nf: its
 * workflow (and what that file includes and defines) back into the script,
 * its includes from the script's folder.
 */
const bringInLocalGroups = (
  source: string,
  wanted: Set<string>,
  files: Record<string, string>,
  scriptPath: string,
): string => {
  const items = topLevelItems(source);
  const defined = new Set(items.flatMap((item) => (item.kind === "workflow" && item.name ? [item.name] : [])));
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const item of items) {
    if (item.kind !== "include") continue;
    const included = readIncludeItem(item.text);
    const groups = included.filter((include) => wanted.has(include.alias) && include.alias === include.name && !defined.has(include.name));
    if (groups.length === 0 || groups.length !== included.length) continue;
    const base = normalizePath(`${directoryOf(scriptPath)}/${included[0].path}`);
    const file = [base, `${base}.nf`, `${base}/main.nf`].find((candidate) => candidate in files);
    if (!file) continue;
    const fromScript = (path: string) =>
      path.startsWith(".") ? relativePath(directoryOf(scriptPath), normalizePath(`${directoryOf(file)}/${path}`)) : path;
    const parts = topLevelItems(files[file]).flatMap((other) => {
      if (other.kind === "include") {
        return readIncludeItem(other.text).map(
          (include) =>
            `include { ${include.name}${include.alias === include.name ? "" : ` as ${include.alias}`} } from '${fromScript(include.path)}'`,
        );
      }
      return other.kind === "process" || other.kind === "function" || (other.kind === "workflow" && other.name) ? [other.text] : [];
    });
    edits.push({ start: item.start, end: item.end, text: parts.join("\n\n") });
  }
  let rebuilt = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    rebuilt = rebuilt.slice(0, edit.start) + edit.text + rebuilt.slice(edit.end);
  }
  return rebuilt;
};

/**
 * Process selectors of a step in a group: a subworkflow's processes run as
 * `GROUP:SUB:PROC` there, so `withName: 'SUB:.*'` becomes `'GROUP:SUB:.*'`.
 * A plain process name matches as it is.
 */
export const withGroupSelectors = (config: string, group: string): string =>
  config.replace(/(withName:\s*)(['"])([^'"]*:[^'"]*)\2/g, (_match, start: string, quote: string, selector: string) =>
    `${start}${quote}${group}:${selector}${quote}`,
  );

/** The selectors as they are outside the groups, for reading a step's settings. */
export const withoutGroupSelectors = (config: string, groups: Iterable<string>): string =>
  [...groups].reduce(
    (text, group) => text.replace(new RegExp(`(withName:\\s*)(['"])${escapeRegExp(group)}:([^'"]*:[^'"]*)\\2`, "g"), "$1$2$3$2"),
    config,
  );

export interface InlinedGroups {
  source: string;
  /** Each grouped step's name (as the layout line has it), with its group. */
  groups: Map<string, string>;
}

export const inlineGroups = (
  original: string,
  { files, path = "main.nf" }: { files?: Record<string, string>; path?: string } = {},
): InlinedGroups => {
  const layout = parseLayoutComment(original);
  const wanted = new Set([...layout.values()].flatMap((entry) => (entry.group ? [entry.group] : [])));
  const none: InlinedGroups = { source: original, groups: new Map() };
  if (wanted.size === 0) return none;
  const source = files ? bringInLocalGroups(original, wanted, files, path) : original;
  const items = topLevelItems(source);
  const entry = items.find((item) => item.kind === "workflow" && !item.name);
  if (!entry) return none;

  let entryText = entry.text;
  const removed: Array<{ start: number; end: number }> = [];
  const inlined = new Set<string>();
  for (const group of wanted) {
    const definition = items.find((item) => item.kind === "workflow" && item.name === group);
    if (!definition) continue;
    const call = entryText.match(new RegExp(`^([ \\t]*)${escapeRegExp(group)}\\((.*)\\)[ \\t]*$`, "m"));
    if (!call) continue;
    const sections = workflowSections(blockBody(definition.text));
    const takes = takeNames(sections.take);
    const args = splitArguments(call[2]);
    if (args.length !== takes.length) continue;
    // Its steps, reading what the call passed instead of its takes.
    let main = sections.main.replace(/^\s*\n/, "").replace(/\s+$/, "");
    takes.forEach((take, index) => {
      main = replaceName(main, take, () => args[index]);
    });
    const emits = emitEntries(sections.emit);
    entryText = entryText.replace(call[0], () => `\n${main}\n`);
    // What the workflow reads of its outputs: what they emit.
    entryText = entryText.replace(
      new RegExp(`(?<![.\\w])${escapeRegExp(group)}\\.out(?:\\.([A-Za-z_]\\w*)|\\[(\\d+)\\])?(?![\\w])`, "g"),
      (match, name: string | undefined, index: string | undefined) => {
        const emit = name ? emits.find((candidate) => candidate.name === name) : emits[index ? Number(index) : 0];
        return emit ? emit.expression : match;
      },
    );
    removed.push({ start: definition.start, end: definition.end });
    inlined.add(group);
  }
  if (inlined.size === 0) return none;

  // Rebuilt from the end, so the earlier offsets still hold.
  const edits = [
    { start: entry.start, end: entry.end, text: entryText },
    ...removed.map((range) => ({ ...range, text: "" })),
  ].sort((left, right) => right.start - left.start);
  let rebuilt = source;
  for (const edit of edits) rebuilt = rebuilt.slice(0, edit.start) + edit.text + rebuilt.slice(edit.end);

  const groups = new Map<string, string>();
  for (const [name, placed] of layout) if (placed.group && inlined.has(placed.group)) groups.set(name, placed.group);
  return { source: rebuilt.replace(/\n{3,}/g, "\n\n"), groups };
};
