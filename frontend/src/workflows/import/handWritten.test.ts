// Scripts written by hand, the way people write Nextflow (pipes, `if`,
// tuple assignment, branch, typed params, functions, publish: and output):
// import keeps every part, export gives code that does the same, and a
// second round changes nothing.

import { describe, expect, it } from "vitest";
import { generateNextflowScript } from "../../generators/core/generateNextflowScript";
import { buildProjectFiles } from "../../export/exportProject";
import { getNodeCode } from "../../registry/nodeCode";
import { importNextflowScript } from "./importScript";
import { blockBody, expandPipe, maskSource, readIncludeItem, splitWorkflowStatements, topLevelItems } from "./nextflowSource";

const scripts = import.meta.glob("./fixtures/*.nf", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** What the entry workflow calls, by name (a pipe through steps as the calls it makes). */
const callsIn = (source: string): string[] => {
  const entry = topLevelItems(source).find((item) => item.kind === "workflow" && !item.name);
  if (!entry) return [];
  const steps = new Set(
    topLevelItems(source).flatMap((item) =>
      item.kind === "include" ? readIncludeItem(item.text).map((included) => included.alias) : item.name ? [item.name] : [],
    ),
  );
  const body = splitWorkflowStatements(blockBody(entry.text))
    .flatMap((statement) => expandPipe(statement.text, (name) => steps.has(name)) ?? [statement.text])
    .join("\n");
  const names = [...maskSource(body, { keepInterpolations: true }).matchAll(/(?<![.\w])([A-Za-z_]\w*)\s*\(/g)];
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


describe("tuple inputs that a call gives whole channels", () => {
  const { imported } = roundTrip(scripts["./fixtures/tuples-from-channels.nf"]);
  const node = (label: string) => imported.nodes.find((candidate) => candidate.data.label === label);
  const ports = (label: string) => (node(label)?.data.inputs ?? []).map((port) => `${port.name}: ${port.label}`);

  it("are one port each, whatever their fields: values only, values and files, a file and a value", () => {
    expect(ports("SCORE")).toEqual(["tuple_1: site, band"]);
    expect(ports("COMPARE")).toEqual(["a: A"]);
    expect(ports("REPORT")).toEqual(["diff: Diff"]);
    // None of their fields is a setting: they come with the channel's items.
    for (const label of ["SCORE", "COMPARE", "REPORT"]) expect(node(label)?.data.customNodeValues).toEqual({});
  });

  it("are connected to existing ports, and their steps show their code", () => {
    for (const edge of imported.edges) {
      const source = imported.nodes.find((candidate) => candidate.id === edge.source);
      const target = imported.nodes.find((candidate) => candidate.id === edge.target);
      expect(source?.data.outputs?.map((port) => port.name), `${edge.source}.${edge.sourceHandle}`).toContain(edge.sourceHandle);
      expect(target?.data.inputs?.map((port) => port.name), `${edge.target}.${edge.targetHandle}`).toContain(edge.targetHandle);
    }
    for (const step of imported.nodes) expect(getNodeCode(step), String(step.data.label)).not.toBeNull();
  });

  it("are written back with the filtered channel", () => {
    const { script } = roundTrip(scripts["./fixtures/tuples-from-channels.nf"]);
    expect(script).toMatch(/(\w+) = MEASURE\.out\.pairs\.filter \{ site, band -> band != "swir" \}\n\s*SCORE\(\1\)/);
  });
});

describe("pipes through steps and outputs taken apart", () => {
  it("are steps connected as the pipe and the assignment say", () => {
    const { imported, script } = roundTrip(scripts["./fixtures/pipes-and-output-tuples.nf"]);
    const label = (id: string) => imported.nodes.find((node) => node.id === id)?.data.label;
    const into = (step: string) =>
      imported.edges
        .filter((edge) => label(edge.target) === step)
        .map((edge) => `${label(edge.source)}.${edge.sourceHandle} -> ${edge.targetHandle}`)
        .sort();
    expect(into("REPORT")).toEqual(["SPLIT.large -> large", "SPLIT.small -> small"]);
    expect(into("SPLIT")).toHaveLength(1);
    expect(script).toContain("DOUBLE(");
    expect(script).toMatch(/DOUBLE\.out\.doubled\.map \{ n -> n \+ 1 \}/);
    expect(script).toContain("REPORT(SPLIT.out.small, SPLIT.out.large)");
    // `ch_text = REPORT(…).text`: the step, and its output read by name.
    expect(script).toMatch(/REPORT\.out\.text\.view\(\)/);
    expect(imported.nodes.filter((node) => node.type === "channelOperator").map((node) => node.data.label)).not.toContain("ch_text");
  });
});

describe("expandPipe", () => {
  const steps = new Set(["A", "B"]);
  const expand = (text: string) => expandPipe(text, (name) => steps.has(name));
  it("writes a pipe through steps as their calls, with operators in between", () => {
    expect(expand("channel.of(1) | A | B | view")).toEqual(["A(channel.of(1))", "B(A.out)", "B.out.view()"]);
    expect(expand("ch | map { x -> x * 2 } | A")).toEqual(["A(ch.map { x -> x * 2 })"]);
    expect(expand("result = ch | A | collect")).toEqual(["A(ch)", "result = A.out.collect()"]);
  });
  it("leaves alone what isn't a pipe through steps", () => {
    expect(expand("ch | map { x -> x } | view")).toBeNull();
    expect(expand("A(ch.filter { x -> x || y })")).toBeNull();
    expect(expand("ch | (A & B)")).toBeNull();
  });
});
