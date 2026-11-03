// "Export project" lays a script out the way Nextflow projects are: main.nf
// keeps the entry workflow, each process goes to modules/local/<name>/,
// each named workflow to subworkflows/local/<name>/, included where used.
// Import reads such a project back (see workflows/import/importScript.ts).

import { lowerSnake } from "../generators/core/naming";
import { maskSource, readIncludeItem, topLevelItems, type TopLevelItem } from "../workflows/import/nextflowSource";

export interface SplitProject {
  /** main.nf, with includes for what moved out. */
  main: string;
  /** The moved files, by path in the project. */
  files: Record<string, string>;
}

/** The names code uses: `FOO(…)`, `ch | FOO`, `FOO.out`, `helper(…)`. */
const callsIn = (text: string): Set<string> =>
  new Set([...maskSource(text, { keepInterpolations: true }).matchAll(/(?<![.\w$])([A-Za-z_]\w*)\b/g)].map((match) => match[1]));

/** The folder a process or workflow goes to. */
const folderFor = (item: TopLevelItem): string =>
  `${item.kind === "process" ? "modules" : "subworkflows"}/local/${lowerSnake(item.name) || item.name.toLowerCase()}`;

/** An include path from `from` (a folder in the project) to `to` (a path from its root). */
const relative = (from: string, to: string): string => {
  const up = from ? from.split("/").length : 0;
  return up === 0 ? `./${to}` : `${"../".repeat(up)}${to}`;
};

const includeLine = (name: string, alias: string, path: string): string =>
  `include { ${alias === name ? name : `${name} as ${alias}`} } from '${path}'`;

/**
 * Where an item starts with the comments above it (blank lines between
 * included): right after the code before it.
 */
const fullStart = (script: string, item: TopLevelItem): number => {
  const before = topLevelItems(script).filter((other) => other.end <= item.start).pop();
  const from = before ? before.end : 0;
  const lead = script.slice(from, item.start).match(/^\s*/)?.[0].length ?? 0;
  return from + lead;
};

export const splitProject = (script: string): SplitProject => {
  const items = topLevelItems(script);
  // Code in main.nf that other files can't see: its functions.
  const functions = new Set(items.filter((item) => item.kind === "function").map((item) => item.name));
  const includes = new Map<string, { name: string; path: string }>();
  for (const item of items.filter((entry) => entry.kind === "include")) {
    for (const include of readIncludeItem(item.text)) includes.set(include.alias, { name: include.name, path: include.path });
  }
  const definitions = items.filter((item) => (item.kind === "process" || item.kind === "workflow") && item.name);
  const byName = new Map(definitions.map((item) => [item.name, item]));
  const calls = new Map(definitions.map((item) => [item.name, callsIn(item.text)]));

  // What can move: code that calls no function of main.nf and only steps that move too.
  const moving = new Set(definitions.filter((item) => ![...(calls.get(item.name) ?? [])].some((name) => functions.has(name))).map((item) => item.name));
  for (let changed = true; changed; ) {
    changed = false;
    for (const name of moving) {
      const stuck = [...(calls.get(name) ?? [])].some((called) => byName.has(called) && called !== name && !moving.has(called));
      if (stuck) {
        moving.delete(name);
        changed = true;
      }
    }
  }
  if (moving.size === 0) return { main: script, files: {} };

  const files: Record<string, string> = {};
  for (const name of moving) {
    const item = byName.get(name) as TopLevelItem;
    const folder = folderFor(item);
    const needed: string[] = [];
    for (const called of calls.get(name) ?? []) {
      const local = byName.get(called);
      if (local && called !== name) needed.push(includeLine(called, called, relative(folder, folderFor(local))));
      const include = includes.get(called);
      if (include) {
        // Project paths (`./modules/nf-core/…`) from this folder; plugins as they are.
        const path = include.path.startsWith("./") ? relative(folder, include.path.slice(2)) : include.path;
        needed.push(includeLine(include.name, called, path));
      }
    }
    const header = needed.length > 0 ? `${needed.sort().join("\n")}\n\n` : "";
    files[`${folder}/main.nf`] = `${header}${script.slice(fullStart(script, item), item.end)}\n`;
  }

  // main.nf without what moved, including it instead (after its other includes).
  let main = script;
  const moved = definitions.filter((item) => moving.has(item.name)).sort((a, b) => b.start - a.start);
  for (const item of moved) main = main.slice(0, fullStart(main, item)) + main.slice(item.end);
  // What the rest of main.nf uses (include lines don't count).
  const remainingCalls = callsIn(
    topLevelItems(main)
      .filter((item) => item.kind !== "include")
      .map((item) => item.text)
      .join("\n"),
  );
  const newIncludes = definitions
    .filter((item) => moving.has(item.name) && remainingCalls.has(item.name))
    .map((item) => includeLine(item.name, item.name, `./${folderFor(item)}`));
  // Includes only moved code used go with it.
  const mainItems = topLevelItems(main);
  for (const item of [...mainItems].reverse()) {
    if (item.kind !== "include") continue;
    const kept = readIncludeItem(item.text).filter((include) => remainingCalls.has(include.alias) || include.path.startsWith("plugin/"));
    const text = kept.length === 0 ? "" : kept.length === readIncludeItem(item.text).length ? item.text : kept.map((include) => includeLine(include.name, include.alias, include.path)).join("\n");
    main = main.slice(0, fullStart(main, item)) + text + main.slice(item.end);
  }
  if (newIncludes.length > 0) {
    const anchor = topLevelItems(main).filter((item) => item.kind === "include").pop();
    const firstCode = topLevelItems(main).find((item) => item.kind !== "params" && item.kind !== "config" && item.kind !== "enable" && item.kind !== "other");
    const at = anchor ? anchor.end : firstCode ? fullStart(main, firstCode) : main.length;
    const block = newIncludes.join("\n");
    main = anchor ? `${main.slice(0, at)}\n${block}${main.slice(at)}` : `${main.slice(0, at)}${block}\n\n${main.slice(at)}`;
  }
  return { main: `${main.replace(/\n{3,}/g, "\n\n").trimEnd()}\n`, files };
};
