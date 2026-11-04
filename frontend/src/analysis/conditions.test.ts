import { describe, expect, it } from "vitest";
import type { BioflowResult } from "./bioflow";
import { conditionsByNode, evaluateCondition, parameterValues, previewConditions } from "./conditions";

const params = new Map<string, string | number | boolean | null>([
  ["aligner", "star"],
  ["skip_qc", false],
  ["min_len", 20],
  ["label", ""],
]);

describe("evaluateCondition", () => {
  it.each([
    ["params.aligner == 'star'", true],
    ["!(params.aligner == 'star')", false],
    ["params.aligner == \"hisat2\"", false],
    ["params.aligner != 'hisat2'", true],
    ["!params.skip_qc", true],
    ["params.skip_qc", false],
    ["params.min_len > 10 && !params.skip_qc", true],
    ["params.min_len <= 10 || params.aligner == 'star'", true],
    ["params.label", false],
    ["(params.min_len >= 20) && (params.min_len < 21)", true],
  ])("%s is %s", (text, expected) => {
    expect(evaluateCondition(text, params)).toBe(expected);
  });

  it.each([
    "params.unknown == 'x'",
    "params.aligner.contains('star')",
    "ch_reads.count() > 0",
    "params.aligner ==",
    "workflow.profile == 'test'",
    // A number and a string: Groovy's rules depend on the case.
    "params.min_len == '20'",
  ])("can't tell %s", (text) => {
    expect(evaluateCondition(text, params)).toBeNull();
  });

  it("knows a && or || from one known side", () => {
    expect(evaluateCondition("params.skip_qc && params.unknown", params)).toBe(false);
    expect(evaluateCondition("!params.skip_qc || params.unknown", params)).toBe(true);
    expect(evaluateCondition("!params.skip_qc && params.unknown", params)).toBeNull();
  });
});

describe("parameterValues", () => {
  it("reads the Parameters node's values by type", () => {
    const nodes = [
      {
        id: "p",
        type: "parameters",
        position: { x: 0, y: 0 },
        data: {
          label: "Parameters",
          parameters: [
            { name: "aligner", type: "text", value: "star" },
            { name: "skip_qc", type: "boolean", value: "true" },
            { name: "min_len", type: "number", value: "20" },
            { name: "fasta", type: "file", value: "genome.fa" },
          ],
        },
      },
    ];
    expect(Object.fromEntries(parameterValues(nodes as never))).toEqual({ aligner: "star", skip_qc: true, min_len: 20, fasta: "genome.fa" });
  });
});

describe("the preview", () => {
  const result = {
    steps: [
      { id: "STAR", name: "STAR", subworkflow: null, conditions: ["params.aligner == 'star'"] },
      { id: "HISAT2", name: "HISAT2", subworkflow: null, conditions: ["!(params.aligner == 'star')", "params.aligner == 'hisat2'"] },
      { id: "QC", name: "QC", subworkflow: null, conditions: [] },
      { id: "ALIGN.A", name: "A", subworkflow: "ALIGN", conditions: ["params.align", "params.x"] },
      { id: "ALIGN.B", name: "B", subworkflow: "ALIGN", conditions: ["params.align"] },
    ],
    subworkflows: [{ id: "ALIGN", name: "ALIGN", workflow: "ALIGN", file: null, parent: null }],
  } as unknown as BioflowResult;
  const names = new Map([
    ["n-star", "STAR"],
    ["n-hisat2", "HISAT2"],
    ["n-qc", "QC"],
    ["n-align", "ALIGN"],
  ]);

  it("gives each node its conditions, a subworkflow those of all its steps", () => {
    expect(Object.fromEntries(conditionsByNode(result, names))).toEqual({
      "n-star": ["params.aligner == 'star'"],
      "n-hisat2": ["!(params.aligner == 'star')", "params.aligner == 'hisat2'"],
      "n-align": ["params.align"],
    });
  });

  it("greys out the branch that won't run with these values", () => {
    const preview = previewConditions(conditionsByNode(result, names), new Map([["aligner", "star"]]));
    expect(preview["n-star"].runs).toBe(true);
    expect(preview["n-hisat2"].runs).toBe(false);
    expect(preview["n-hisat2"].conditions.map((entry) => entry.holds)).toEqual([false, false]);
    // params.align isn't set: can't tell.
    expect(preview["n-align"].runs).toBeNull();
    const hisat = previewConditions(conditionsByNode(result, names), new Map([["aligner", "hisat2"]]));
    expect(hisat["n-star"].runs).toBe(false);
    expect(hisat["n-hisat2"].runs).toBe(true);
  });
});
