import { describe, it, expect } from "vitest";
import type { Edge, Node } from "reactflow";
import { generateNextflowScript } from "./generateNextflowScript";
import { demoWorkflowSeed } from "../../demo/demoWorkflow";

// The built-in demo graph is a realistic input: file input -> two filter
// branches (one mapped to uppercase) -> merge -> display output.
const nodes = demoWorkflowSeed.nodes as unknown as Node[];
const edges = demoWorkflowSeed.edges as unknown as Edge[];

describe("generateNextflowScript", () => {
  const script = generateNextflowScript(
    nodes,
    edges,
    "Demo Workflow",
    "results",
    "{workflow_name}"
  );

  it("produces a DSL2-style script with params and a workflow block", () => {
    expect(script).toContain("params.outdir = 'results'");
    expect(script).toMatch(/workflow\s*\{/);
    expect(script).toContain("process ");
  });

  it("emits process logic for the filter and map operators", () => {
    // filter branches use grep with the configured keywords
    expect(script).toContain("grep");
    expect(script).toMatch(/Barry|Bee/);
    // the uppercase map uses tr
    expect(script.toLowerCase()).toContain("tr '[:lower:]' '[:upper:]'");
  });

  it("references the input channel from the file input node", () => {
    expect(script).toContain("ch_files");
  });

  it("is deterministic for the same graph within a run", () => {
    const again = generateNextflowScript(
      nodes,
      edges,
      "Demo Workflow",
      "results",
      "{workflow_name}"
    );
    // Process names embed a timestamp, so compare structure rather than exact
    // text: both runs should have the same number of process blocks.
    const count = (s: string) => (s.match(/process\s+\w+/g) || []).length;
    expect(count(again)).toBe(count(script));
    expect(count(script)).toBeGreaterThan(0);
  });
});
