import { describe, expect, it } from "vitest";
import { buildLintFixtures } from "../../scripts/lint/fixtures";
import { generateNextflowScriptWithNames } from "../generators/core/generateNextflowScript";
import { importNextflowScript } from "../workflows/import/importScript";
import { lineOwners } from "./scriptLines";

const ownersOf = (
  nodes: Parameters<typeof generateNextflowScriptWithNames>[0],
  edges: Parameters<typeof generateNextflowScriptWithNames>[1],
) => {
  const { script, names } = generateNextflowScriptWithNames(
    nodes,
    edges,
    "wf",
    "results",
  );
  const lines = script.split("\n");
  const owners = lineOwners(script, names, nodes);
  const lineOf = (pattern: RegExp) =>
    lines.findIndex((line) => pattern.test(line)) + 1;
  return { script, owners, lineOf };
};

describe("lineOwners", () => {
  it("gives each line of a definition, call and channel block to its node", () => {
    const source = [
      "process QC {",
      "    input:",
      "    path reads",
      "    output:",
      "    path 'qc.txt'",
      "    script:",
      '    "touch qc.txt"',
      "}",
      "",
      "workflow {",
      "    ch_reads = channel.fromPath('reads/*.fq')",
      "        .filter { file -> file.size() > 0 }",
      "    QC(ch_reads)",
      "}",
      "",
    ].join("\n");
    const imported = importNextflowScript(source);
    const { owners, lineOf } = ownersOf(imported.nodes, imported.edges);
    const qc = imported.nodes.find((node) => node.data.label === "QC")?.id;
    const reads = imported.nodes.find(
      (node) => node.type === "channelOperator",
    )?.id;
    expect(owners.get(lineOf(/^process QC/))).toBe(qc);
    expect(owners.get(lineOf(/touch qc.txt/))).toBe(qc);
    expect(owners.get(lineOf(/^\s+QC\(/))).toBe(qc);
    expect(owners.get(lineOf(/ch_reads = channel/))).toBe(reads);
    expect(owners.get(lineOf(/\.filter/))).toBe(reads);
    expect(owners.get(1)).toBeUndefined();
  });

  it.each(
    buildLintFixtures().map((fixture) => [fixture.name, fixture] as const),
  )("gives every step of the %s fixture a line", (_name, fixture) => {
    const { owners } = ownersOf(fixture.nodes, fixture.edges);
    const owning = new Set(owners.values());
    // Nodes that write code: steps, inputs and channel code (not notes, Parameters or outputs only shown).
    const writers = fixture.nodes.filter(
      (node) => !["note", "parameters"].includes(String(node.type)),
    );
    const missing = writers
      .filter((node) => !owning.has(node.id))
      .map((node) => `${node.type}:${node.data.label}`);
    expect(missing).toEqual([]);
  });
});
