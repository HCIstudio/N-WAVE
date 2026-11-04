import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  type BioflowResult,
  bioflowNodeConnections,
  canvasStepConnections,
  nodesForSteps,
} from "./bioflow";

// Nodes named as the export names them: a kept script name wins.
const node = (id: string, scriptName: string, type = "process"): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { label: scriptName, scriptName },
});

const step = (id: string, subworkflow: string | null = null) => ({
  id,
  name: id.split(".").pop() ?? id,
  process: id.split(".").pop() ?? id,
  file: "main.nf",
  subworkflow,
  code: "",
  conditions: [],
});

const result: BioflowResult = {
  schema: "n-wave-bioflow/1",
  tool: { name: "BioFlow-Insight", version: "2.1.1", engine: "nls" },
  dsl: "DSL2",
  error: null,
  notes: [],
  steps: [
    step("INDEX_GENOME"),
    step("GENOME.INDEX", "GENOME"),
    step("GENOME.STATS", "GENOME"),
    step("ALIGN"),
    step("ELSEWHERE"),
  ],
  connections: [
    { from: "GENOME.INDEX", to: "GENOME.STATS" },
    { from: "GENOME.INDEX", to: "ALIGN" },
    { from: "ALIGN", to: "ELSEWHERE" },
  ],
  subworkflows: [
    {
      id: "GENOME",
      name: "GENOME",
      workflow: "PREPARE_GENOME",
      file: "sub.nf",
      parent: null,
    },
  ],
  conditions: [],
  groups: { condition: [], dominator: [], parallel: [] },
  specification: null,
  metrics: {},
};

const nodes = [
  node("a", "GENOME"),
  node("b", "ALIGN"),
  node("c", "INDEX_GENOME"),
];

describe("nodesForSteps", () => {
  it("maps steps to the node called by their top-level name", () => {
    expect(Object.fromEntries(nodesForSteps(result, nodes))).toEqual({
      INDEX_GENOME: "c",
      "GENOME.INDEX": "a",
      "GENOME.STATS": "a",
      ALIGN: "b",
    });
  });
});

describe("bioflowNodeConnections", () => {
  it("lifts connections to the canvas, without those inside one node or to unknown steps", () => {
    expect([...bioflowNodeConnections(result, nodes)]).toEqual(["a->b"]);
  });
});

describe("canvasStepConnections", () => {
  it("connects steps directly and through nodes that aren't steps", () => {
    const canvas = [
      node("s1", "A"),
      node("op", "ch", "channelOperator"),
      node("s2", "B"),
      node("s3", "C"),
    ];
    const edges: Edge[] = [
      { id: "1", source: "s1", target: "op" },
      { id: "2", source: "op", target: "s2" },
      { id: "3", source: "s2", target: "s3" },
      { id: "4", source: "op", target: "op" },
    ];
    const connections = canvasStepConnections(
      canvas,
      edges,
      (entry) => entry.type === "process",
    );
    // s1 reaches s2 through the operator, but not s3 past s2.
    expect([...connections].sort()).toEqual(["s1->s2", "s2->s3"]);
  });
});
