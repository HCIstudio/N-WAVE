import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { registerNfCoreNodes } from "../../scripts/lint/fixtures";
import { analysisKeyText, sha256Hex } from "../analysis/demoAnalysis";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import recorded from "./analysisResults.json";
import { demoWorkflowSeed } from "./demoWorkflow";
import { rnaseqExampleSeed } from "./rnaseqExample";
import rnaseqStarSalmon from "./rnaseqStarSalmonExample.json";

const examples = [demoWorkflowSeed, rnaseqExampleSeed, rnaseqStarSalmon] as unknown as Array<{
  name: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}>;

describe("the demo's recorded analyses", () => {
  it.each(examples.map((example) => [example.name, example] as const))(
    "has the analysis of %s as it generates now",
    async (_name, example) => {
      registerNfCoreNodes(example.nodes);
      const script = generateNextflowScript(example.nodes, example.edges, example.name, "results");
      const key = await sha256Hex(analysisKeyText(script));
      // Changed the examples or the code N-WAVE writes? Run scripts/record-demo-analysis.sh.
      expect(Object.keys(recorded), "run scripts/record-demo-analysis.sh").toContain(key);
    },
  );

  it("doesn't depend on the workflow's name (a copy matches too)", () => {
    expect(analysisKeyText("// Demo 1\nrest\n")).toBe(analysisKeyText("// Demo 1 Copy\nrest\n"));
  });
});
