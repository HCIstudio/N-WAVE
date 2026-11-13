import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import { switchConditions } from "../components/panels/logic/BranchPanel";
import { connectionProblem } from "../context/WorkflowContext";
import { STRUCTURE_SCRIPT } from "../courses/courseWorkflows";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { DEFAULT_EXECUTION_SETTINGS } from "../pages/workflow/executionSettings";
import { checkWorkflow } from "../pages/workflow/workflowCheck";
import { findExtraConnections } from "../registry/portArity";
import { importNextflowScript } from "../workflows/import/importScript";
import {
  armCondition,
  armProblem,
  branchArms,
  branchChain,
  branchConditionsByNode,
  canJoinArm,
  exclusiveArms,
} from "./branches";

const scripts = import.meta.glob("../workflows/import/fixtures/branches/*.nf", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const script = (name: string) => scripts[`../workflows/import/fixtures/branches/${name}`];

const workflowBlock = (text: string) => text.slice(text.indexOf("workflow {"), text.indexOf("\n// N-WAVE layout"));
const generate = (nodes: Node<NodeData>[], edges: Edge[]) => generateNextflowScript(nodes, edges, "wf", "results");
const node = (id: string, type: string, data: Record<string, unknown> = {}, x = 0): Node<NodeData> =>
  ({ id, type, position: { x, y: 0 }, data: { label: id, ...data } }) as unknown as Node<NodeData>;

describe("a branch's arms", () => {
  it("run in order: an arm when its condition holds and none before it does; else when none does", () => {
    const conditions = ["params.aligner == 'star'", "params.aligner == 'hisat2'"];
    expect(branchArms({ data: { conditions } })).toEqual(["if", "else-if-1", "else"]);
    expect(armCondition(conditions, "if")).toBe("params.aligner == 'star'");
    expect(armCondition(conditions, "else-if-1")).toBe("!(params.aligner == 'star') && params.aligner == 'hisat2'");
    expect(armCondition(conditions, "else")).toBe("!(params.aligner == 'star') && !(params.aligner == 'hisat2')");
    // Saved before conditions were a list: the one condition.
    expect(branchArms({ data: { condition: "params.trim" } })).toEqual(["if", "else"]);
  });

  it("nest: a step in a branch in an arm of another runs under both", () => {
    const nodes = [
      node("outer", "branch", { conditions: ["!params.skip"] }),
      node("inner", "branch", { conditions: ["params.x"], branch: { id: "outer", arm: "if" } }),
      node("step", "process", { branch: { id: "inner", arm: "else" } }),
      node("other", "process", { branch: { id: "outer", arm: "else" } }),
    ];
    expect(branchChain(nodes[2], nodes)).toEqual([
      { id: "inner", arm: "else" },
      { id: "outer", arm: "if" },
    ]);
    expect(branchConditionsByNode(nodes).get("step")).toEqual(["!params.skip", "!(params.x)"]);
    // Different arms of one branch exclude each other, at any depth.
    expect(exclusiveArms(branchChain(nodes[2], nodes), branchChain(nodes[3], nodes))).toBe(true);
    expect(exclusiveArms(branchChain(nodes[2], nodes), branchChain(nodes[1], nodes))).toBe(false);
  });

  it("take steps, operators, outputs and branches, not inputs, notes, the branch itself or a branch it is in", () => {
    const nodes = [
      node("outer", "branch", { conditions: ["a"] }),
      node("inner", "branch", { conditions: ["b"], branch: { id: "outer", arm: "if" } }),
      node("step", "process"),
      node("input", "fileInput"),
      node("note", "note"),
      node("grouped", "process", { group: "QC" }),
    ];
    expect(canJoinArm(nodes[2])).toBe(true);
    expect(armProblem("inner", nodes[2], nodes)).toBeNull();
    expect(armProblem("inner", nodes[3], nodes)).toMatch(/can't be in a branch's arm/);
    expect(armProblem("inner", nodes[4], nodes)).toMatch(/can't be in a branch's arm/);
    expect(armProblem("inner", nodes[1], nodes)).toMatch(/its own arm/);
    expect(armProblem("inner", nodes[0], nodes)).toMatch(/holds this branch/);
    expect(armProblem("outer", nodes[5], nodes)).toMatch(/in a group/);
  });
});

describe("imported control flow", () => {
  it("reads if / else if / else as one branch with three arms, the step after it reading each", () => {
    const imported = importNextflowScript(script("aligner-chain.nf"));
    expect(imported.warnings).toEqual([]);
    const branch = imported.nodes.find((entry) => entry.type === "branch");
    expect(branch?.data.conditions).toEqual(["params.aligner == 'star'", "params.aligner == 'hisat2'"]);
    const arm = (id: string) => (imported.nodes.find((entry) => entry.id === id)?.data.branch as { arm?: string } | undefined)?.arm;
    expect([arm("n-star"), arm("n-hisat2"), arm("n-bowtie2")]).toEqual(["if", "else-if-1", "else"]);
    const into = imported.edges.filter((edge) => edge.target === "n-report" && edge.targetHandle === "aligned").map((edge) => edge.source);
    expect(into.sort()).toEqual(["n-bowtie2", "n-hisat2", "n-star"]);
    // Three connections into a one-connection input, from three exclusive arms: one at a time.
    expect(findExtraConnections(imported.nodes, imported.edges)).toEqual([]);
    expect(workflowBlock(generate(imported.nodes, imported.edges))).toContain(`    ch_bam = channel.empty()
    if (params.aligner == 'star') {
        STAR(ch_reads)
        ch_bam = STAR.out.bam
    } else if (params.aligner == 'hisat2') {
        HISAT2(ch_reads)
        ch_bam = HISAT2.out.bam
    } else {
        BOWTIE2(ch_reads)
        ch_bam = BOWTIE2.out.bam
    }`);
  });

  it("reads a switch as if / else if, and says so", () => {
    const imported = importNextflowScript(script("switch.nf"));
    expect(imported.warnings).toEqual(["The switch on params.aligner is written as if / else if: Nextflow's strict syntax has no switch."]);
    const branch = imported.nodes.find((entry) => entry.type === "branch");
    // Two cases with one body: one arm.
    expect(branch?.data.conditions).toEqual(["params.aligner == 'star'", "params.aligner == 'hisat2' || params.aligner == 'hisat'"]);
    const text = workflowBlock(generate(imported.nodes, imported.edges));
    expect(text).toContain("} else if (params.aligner == 'hisat2' || params.aligner == 'hisat') {");
    expect(text).not.toContain("switch");
  });

  it("reads nested ifs, skip flags and the versions collected from whichever steps ran", () => {
    const imported = importNextflowScript(script("skip-flags.nf"));
    expect(imported.warnings).toEqual([]);
    const branches = imported.nodes.filter((entry) => entry.type === "branch");
    expect(branches.map((entry) => entry.data.conditions)).toEqual([["!params.skip_qc"], ["!params.skip_trimming"], ["params.aligner == 'star'"]]);
    // The star choice is inside the trimming arm.
    expect(branches[2].data.branch).toEqual({ id: branches[1].id, arm: "if" });
    expect(imported.nodes.find((entry) => entry.id === "n-star")?.data.branch).toEqual({ id: branches[2].id, arm: "if" });
    // ch_versions.mix(…) in an arm: each step's versions reach the report, when it ran.
    const versions = imported.edges.filter((edge) => edge.target === "n-report" && edge.targetHandle === "versions").map((edge) => `${edge.source}.${edge.sourceHandle}`);
    expect(versions.sort()).toEqual(["n-fastqc.versions", "n-star.versions", "n-trim.versions"]);
    // ch_versions.collect(): all of them to one REPORT task, as before.
    const report = imported.nodes.find((entry) => entry.id === "n-report")?.data.customNodeDefinition as { inputs: Array<{ name: string; collect?: boolean }> };
    expect(report.inputs.find((input) => input.name === "versions")?.collect).toBe(true);
    expect(workflowBlock(generate(imported.nodes, imported.edges))).toMatch(/REPORT\(\w+, [\w.()]+\.collect\(\)\)/);
    // ch_trimmed: TRIM's reads when trimming, else the reads as they came (a connection that holds in the else arm only).
    const trimmed = imported.edges.filter((edge) => edge.target === "n-report" && edge.targetHandle === "aligned");
    expect(trimmed.map((edge) => [edge.source, (edge.data as { when?: { arm?: string } })?.when?.arm ?? null])).toEqual(
      expect.arrayContaining([
        ["n-trim", null],
        ["n-ch_trimmed", "else"],
      ]),
    );
  });

  it("makes a step called in two arms two nodes", () => {
    const imported = importNextflowScript(script("same-step.nf"));
    const fastqc = imported.nodes.filter((entry) => entry.data.label === "FASTQC");
    expect(fastqc.map((entry) => (entry.data.branch as { arm: string }).arm).sort()).toEqual(["else", "if"]);
  });

  it("keeps a loop as code, and says why", () => {
    const imported = importNextflowScript(script("loop.nf"));
    expect(imported.nodes.some((entry) => entry.type === "branch")).toBe(false);
    expect(imported.warnings[0]).toMatch(/a for loop: it stays code as written, but Nextflow's strict syntax/);
    expect(workflowBlock(generate(imported.nodes, imported.edges))).toContain("for (name in ['a', 'b']) {");
  });

  it("keeps an if that calls no step as code", () => {
    const imported = importNextflowScript(`workflow {
    ch = channel.of(1)
    if (params.twice) {
        ch = ch.map { x -> x * 2 }
    }
    ch.view()
}
`);
    expect(imported.nodes.some((entry) => entry.type === "branch")).toBe(false);
  });

  it.each([...Object.keys(scripts).map((path) => path.split("/").pop() as string), "course: two aligners"])(
    "comes back the same after an export and an import: %s",
    (name) => {
      const source = name === "course: two aligners" ? STRUCTURE_SCRIPT : script(name);
      const first = importNextflowScript(source);
      const exported = generate(first.nodes, first.edges);
      const again = importNextflowScript(exported);
      expect(again.warnings.filter((warning) => !/loop/.test(warning))).toEqual([]);
      expect(generate(again.nodes, again.edges)).toBe(exported);
    },
  );
});

describe("a branch built on the canvas", () => {
  // Parameters (aligner), TRIM, two aligners in a branch's arms, and REPORT reading either.
  const built = () => {
    const nodes = [
      node("p", "parameters", { parameters: [{ name: "aligner", type: "text", value: "star" }] }),
      node("trim", "process", { label: "TRIM", outputs: [{ name: "out" }] }, 100),
      node("b", "branch", { label: "If", conditions: ["params.aligner == 'star'"] }, 200),
      node("star", "process", { label: "STAR", inputs: [{ name: "in" }], outputs: [{ name: "out" }], branch: { id: "b", arm: "if" } }, 300),
      node("hisat", "process", { label: "HISAT2", inputs: [{ name: "in" }], outputs: [{ name: "out" }], branch: { id: "b", arm: "else" } }, 300),
      node("report", "outputDisplay", { label: "Report", inputs: [{ name: "in" }] }, 400),
    ];
    const edges: Edge[] = [
      { id: "e1", source: "trim", sourceHandle: "out", target: "star", targetHandle: "in" },
      { id: "e2", source: "trim", sourceHandle: "out", target: "hisat", targetHandle: "in" },
      { id: "e3", source: "star", sourceHandle: "out", target: "report", targetHandle: "in" },
      { id: "e4", source: "hisat", sourceHandle: "out", target: "report", targetHandle: "in" },
    ];
    return { nodes, edges };
  };

  it("takes a step into an arm by a line from the arm's exit, and refuses inputs and other lines into the arm handle", () => {
    const { nodes, edges } = built();
    expect(connectionProblem({ source: "b", sourceHandle: "else", target: "trim", targetHandle: "branch" }, nodes, edges)).toBeNull();
    expect(connectionProblem({ source: "b", sourceHandle: "if", target: "p", targetHandle: "branch" }, nodes, edges)).toMatch(/can't be in a branch's arm/);
    expect(connectionProblem({ source: "trim", sourceHandle: "out", target: "star", targetHandle: "branch" }, nodes, edges)).toMatch(/Only a branch's exit/);
    // A second aligner into the report: from another arm, it's allowed.
    const one = edges.filter((edge) => edge.id !== "e4");
    expect(connectionProblem({ source: "hisat", sourceHandle: "out", target: "report", targetHandle: "in" }, nodes, one)).toBeNull();
    // From the same arm, it isn't.
    const both = nodes.map((entry) => (entry.id === "hisat" ? { ...entry, data: { ...entry.data, branch: { id: "b", arm: "if" } } } : entry));
    expect(connectionProblem({ source: "hisat", sourceHandle: "out", target: "report", targetHandle: "in" }, both, one)).toMatch(/takes one connection/);
  });

  it("passes the workflow check, and says when a branch lacks a condition or an arm reads another arm", () => {
    const { nodes, edges } = built();
    const context = { missingNfCoreComponents: [], settings: DEFAULT_EXECUTION_SETTINGS, docker: null, nextflow: null, limits: null };
    const ids = (problems: ReturnType<typeof checkWorkflow>) => problems.map((problem) => problem.id).filter((id) => /branch|arms|extra/.test(id));
    expect(ids(checkWorkflow(nodes, edges, context))).toEqual([]);
    const empty = nodes.map((entry) => (entry.id === "b" ? { ...entry, data: { ...entry.data, conditions: [""] } } : entry));
    expect(ids(checkWorkflow(empty, edges, context))).toEqual(["b:branch-condition"]);
    const across = [...edges, { id: "e5", source: "star", sourceHandle: "out", target: "hisat", targetHandle: "in" }];
    expect(ids(checkWorkflow(nodes, across, context))).toContain("arms:e5");
  });

  it("is written as its if / else, and a switch on a parameter as if / else if", () => {
    const { nodes, edges } = built();
    const text = workflowBlock(generate(nodes, edges));
    expect(text).toMatch(/ch_in = channel\.empty\(\)\n\s+if \(params\.aligner == 'star'\) \{\n\s+STAR\(trim_out\)\n\s+ch_in = STAR\.out\[0\]\n\s+\} else \{\n\s+HISAT2\(trim_out\)\n\s+ch_in = HISAT2\.out\[0\]\n\s+\}\n\s+REPORT\(ch_in/);
    expect(switchConditions("aligner", ["star", "hisat2", "3", "true"])).toEqual([
      "params.aligner == 'star'",
      "params.aligner == 'hisat2'",
      "params.aligner == 3",
      "params.aligner == true",
    ]);
    const switched = nodes.map((entry) =>
      entry.id === "b" ? { ...entry, data: { ...entry.data, conditions: switchConditions("aligner", ["star", "hisat2"]) } } : entry,
    );
    const moved = switched.map((entry) => (entry.id === "hisat" ? { ...entry, data: { ...entry.data, branch: { id: "b", arm: "else-if-1" } } } : entry));
    expect(workflowBlock(generate(moved, edges))).toContain("} else if (params.aligner == 'hisat2') {");
  });
});
