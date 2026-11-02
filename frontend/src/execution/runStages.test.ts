import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeRunSummary } from "./nodeRuns";
import { countStages, runStages } from "./runStages";

const node = (id: string, type: string, label = id.toUpperCase()): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: { label },
});
const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });
const summary = (status: NodeRunSummary["status"], done: number, total: number, extra: Partial<NodeRunSummary> = {}): NodeRunSummary => ({
  status,
  total,
  done,
  failed: status === "failed" ? 1 : 0,
  ignored: 0,
  running: status === "running" ? total - done : 0,
  cached: 0,
  tasks: [],
  ...extra,
});

describe("runStages", () => {
  it("lists the steps that started, then the connected ones still waiting", () => {
    const nodes = [
      node("in", "fileInput"),
      node("qc", "process"),
      node("trim", "process"),
      node("filter", "filter"),
      node("loose", "process"),
      node("note", "note"),
      node("out", "outputDisplay"),
    ];
    const edges = [edge("in", "qc"), edge("in", "trim"), edge("trim", "filter"), edge("filter", "out")];
    const stages = runStages({
      nodes,
      edges,
      nodeRuns: { trim: summary("running", 1, 4), qc: summary("succeeded", 4, 4) },
    });
    expect(stages.map((stage) => [stage.id, stage.label, stage.status, stage.done, stage.total])).toEqual([
      ["trim", "TRIM", "running", 1, 4],
      ["qc", "QC", "succeeded", 4, 4],
      ["filter", "FILTER", "waiting", 0, 0],
    ]);
    expect(countStages(stages)).toEqual({ waiting: 1, running: 1, succeeded: 1, failed: 0, cached: 0 });
  });

  it("shows a pipeline's processes, and as many waiting as Nextflow's console lists", () => {
    const pipeline = node("rnaseq", "pipeline");
    const stages = runStages({
      nodes: [pipeline],
      edges: [],
      nodeRuns: {
        rnaseq: summary("running", 3, 4, {
          processes: [
            { process: "NFCORE_RNASEQ:A:FASTQC", label: "FASTQC", ...summary("succeeded", 2, 2) },
            { process: "NFCORE_RNASEQ:A:TRIMGALORE", label: "TRIMGALORE", ...summary("running", 1, 2) },
          ],
        }),
      },
      consoleProcesses: 5,
    });
    expect(stages.map((stage) => [stage.label, stage.status])).toEqual([
      ["FASTQC", "succeeded"],
      ["TRIMGALORE", "running"],
      ["A process that hasn't started yet", "waiting"],
      ["A process that hasn't started yet", "waiting"],
      ["A process that hasn't started yet", "waiting"],
    ]);
  });
});
