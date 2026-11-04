// The scripts of the browser demo's built-in examples, as the demo generates
// them, keyed by what the demo looks their analysis up by
// (src/analysis/demoAnalysis.ts). scripts/record-demo-analysis.sh analyses
// them and writes src/demo/analysisResults.json.
//
//   npx vite-node scripts/analysis/demoScripts.ts -- <scripts.json>

import { writeFileSync } from "node:fs";
import type { Edge, Node } from "@xyflow/react";
import { analysisKeyText, sha256Hex } from "../../src/analysis/demoAnalysis";
import type { NodeData } from "../../src/components/nodes/BaseNode";
import { demoWorkflowSeed } from "../../src/demo/demoWorkflow";
import { rnaseqExampleSeed } from "../../src/demo/rnaseqExample";
import rnaseqStarSalmon from "../../src/demo/rnaseqStarSalmonExample.json";
import { generateNextflowScript } from "../../src/generators/core/generateNextflowScript";
import { registerNfCoreNodes } from "../lint/fixtures";

const examples = [
  demoWorkflowSeed,
  rnaseqExampleSeed,
  rnaseqStarSalmon,
] as unknown as Array<{
  name: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}>;

const scripts: Record<string, string> = {};
for (const example of examples) {
  registerNfCoreNodes(example.nodes);
  const script = generateNextflowScript(
    example.nodes,
    example.edges,
    example.name,
    "results",
  );
  scripts[await sha256Hex(analysisKeyText(script))] = script;
  process.stdout.write(`${example.name}\n`);
}
writeFileSync(
  process.argv[process.argv.length - 1],
  `${JSON.stringify(scripts, null, 1)}\n`,
);
