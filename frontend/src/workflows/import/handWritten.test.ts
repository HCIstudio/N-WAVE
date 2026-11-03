// Scripts written by hand, the way people write Nextflow (pipes, `if`,
// tuple assignment, branch, typed params, functions, publish: and output):
// import keeps every part, export gives code that does the same, and a
// second round changes nothing.

import { describe, expect, it } from "vitest";
import { generateNextflowScript } from "../../generators/core/generateNextflowScript";
import { importNextflowScript } from "./importScript";
import { blockBody, maskSource, topLevelItems } from "./nextflowSource";

const scripts = import.meta.glob("./fixtures/*.nf", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** What the entry workflow calls, by name. */
const callsIn = (source: string): string[] => {
  const entry = topLevelItems(source).find((item) => item.kind === "workflow" && !item.name);
  if (!entry) return [];
  const names = [...maskSource(blockBody(entry.text), { keepInterpolations: true }).matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)];
  return [...new Set(names.map((match) => match[1]))].filter((name) => !["if", "for", "while"].includes(name)).sort();
};

/** The top-level definitions, by kind and name. */
const definitions = (source: string): string[] =>
  topLevelItems(source)
    .filter((item) => ["process", "workflow", "function", "output"].includes(item.kind))
    .map((item) => `${item.kind} ${item.name}`)
    .sort();

const roundTrip = (source: string) => {
  const imported = importNextflowScript(source);
  return { imported, script: generateNextflowScript(imported.nodes, imported.edges, "wf", "results") };
};

describe.each(Object.entries(scripts))("the hand-written script %s", (_path, source) => {
  it("imports without warnings", () => {
    expect(roundTrip(source).imported.warnings).toEqual([]);
  });

  it("is written back with every call and definition", () => {
    const { script } = roundTrip(source);
    expect(callsIn(script)).toEqual(callsIn(source));
    expect(definitions(script)).toEqual(definitions(source));
  });

  it("comes back the same after a second round", () => {
    const { script } = roundTrip(source);
    expect(roundTrip(script).script).toBe(script);
  });
});
