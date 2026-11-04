import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import { runBlockedReason } from "../pages/workflow/useWorkflowCheck";
import { analysisProblems, codeSignature, type WorkflowAnalysis } from "./analysis";
import type { BioflowResult } from "./bioflow";

const node = (id: string, data: Partial<NodeData> = {}): Node<NodeData> =>
  ({ id, type: "process", position: { x: 0, y: 0 }, data: { label: id, ...data } }) as Node<NodeData>;
const nodes = [node("qc"), node("fastqc", { nwaveNfCoreModuleId: "nf-core/fastqc" }), node("sub", { nwaveNfCoreModuleId: "nf-core/subworkflows/bam_stats_samtools" })];

const bioflow = (error: BioflowResult["error"]) => ({ status: "done", result: { error } as BioflowResult }) as const;

const analysis = (overrides: Partial<WorkflowAnalysis>): WorkflowAnalysis => ({
  script: "",
  owners: new Map([[12, "qc"]]),
  names: new Map(),
  lint: { status: "done", result: { tool: { name: "nextflow lint", image: "x" }, files: ["main.nf"], problems: [] } },
  bioflow: bioflow(null),
  ...overrides,
});

describe("analysisProblems", () => {
  it("puts lint's findings on the node whose code they're in, with the tool and the line", () => {
    const problems = analysisProblems(
      analysis({
        lint: {
          status: "done",
          result: {
            tool: { name: "nextflow lint", image: "x" },
            files: ["main.nf"],
            problems: [
              { level: "error", file: "main.nf", line: 12, column: 5, message: "`x` is not defined" },
              { level: "warning", file: "main.nf", line: 3, column: 1, message: "Unused" },
              { level: "error", file: "modules/nf-core/fastqc/main.nf", line: 7, column: 1, message: "Bad" },
              { level: "error", file: "subworkflows/nf-core/bam_stats_samtools/main.nf", line: 2, column: 1, message: "Worse" },
            ],
          },
        },
      }),
      nodes,
    );
    expect(problems.map(({ nodeId, level, message, advisory }) => ({ nodeId, level, message, advisory }))).toEqual([
      { nodeId: "qc", level: "error", message: "`x` is not defined (nextflow lint, line 12)", advisory: true },
      { nodeId: undefined, level: "warning", message: "Unused (nextflow lint, line 3)", advisory: true },
      { nodeId: "fastqc", level: "error", message: "Bad (nextflow lint, modules/nf-core/fastqc/main.nf, line 7)", advisory: true },
      { nodeId: "sub", level: "error", message: "Worse (nextflow lint, subworkflows/nf-core/bam_stats_samtools/main.nf, line 2)", advisory: true },
    ]);
  });

  it("adds BioFlow-Insight's error, but not Nextflow's parser error when lint found errors", () => {
    const parserError = { code: "ewlsif", message: "Nextflow's parser found an error in the code.", file: "main.nf" };
    expect(analysisProblems(analysis({ bioflow: bioflow(parserError) }), nodes).map((problem) => problem.id)).toEqual([
      "bioflow:ewlsif",
    ]);
    const withLintError = analysis({
      bioflow: bioflow(parserError),
      lint: {
        status: "done",
        result: { tool: { name: "nextflow lint", image: "x" }, files: [], problems: [{ level: "error", file: "main.nf", line: 12, column: 1, message: "m" }] },
      },
    });
    expect(analysisProblems(withLintError, nodes).map((problem) => problem.id)).toEqual(["lint:main.nf:12:1:m"]);
  });

  it("finds nothing when the tools didn't run", () => {
    const unavailable = { status: "unavailable", reason: "no Docker" } as const;
    expect(analysisProblems(analysis({ lint: unavailable, bioflow: unavailable }), nodes)).toEqual([]);
  });

  it("never blocks a run", () => {
    const problems = analysisProblems(analysis({ bioflow: bioflow({ code: "ccnbf", message: "m", file: null }) }), nodes);
    expect(runBlockedReason(problems)).toBeNull();
  });
});

describe("codeSignature", () => {
  it("changes with the code, not with positions", () => {
    const moved = nodes.map((entry) => ({ ...entry, position: { x: 99, y: 99 } }));
    expect(codeSignature(moved, [])).toBe(codeSignature(nodes, []));
    expect(codeSignature([node("qc", { label: "QC 2" })], [])).not.toBe(codeSignature([node("qc")], []));
  });
});
