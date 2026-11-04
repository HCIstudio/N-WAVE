// Scripts written by hand, the way people write Nextflow (pipes, `if`,
// tuple assignment, branch, typed params, functions, publish: and output):
// import keeps every part, export gives code that does the same, and a
// second round changes nothing.

import { describe, expect, it } from "vitest";
import { generateNextflowScript } from "../../generators/core/generateNextflowScript";
import { buildProjectFiles } from "../../export/exportProject";
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

  it("comes back the same from an exported project (processes in modules/local)", () => {
    const { script } = roundTrip(source);
    const files = Object.fromEntries(
      Object.entries(buildProjectFiles({ workflowName: "wf", script, inputFiles: [], moduleFiles: {} })).map(([path, content]) => [path, String(content)]),
    );
    expect(Object.keys(files).some((path) => path.startsWith("modules/local/"))).toBe(true);
    const imported = importNextflowScript(files["main.nf"], { files, path: "main.nf", config: files["nextflow.config"] });
    expect(imported.warnings).toEqual([]);
    expect(generateNextflowScript(imported.nodes, imported.edges, "wf", "results")).toBe(script);
  });
});

describe("a channel set in both branches of an if", () => {
  it("stays a channel: the other branch's value isn't lost to a step's output", () => {
    const source = scripts["./fixtures/channel-set-in-if-else.nf"];
    const { script } = roundTrip(source);
    expect(script).toContain("ch_align = TRIM.out.reads");
    expect(script).toContain("ch_align = ch_reads");
    expect(script).toContain("ALIGN(ch_align)");
    expect(script).not.toMatch(/TRIM\.out\.reads\s*=/);
  });
});

