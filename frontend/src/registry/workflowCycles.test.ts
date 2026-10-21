import type { Edge, Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { NodeData } from "../components/nodes/BaseNode";
import { generateNextflowScript } from "../generators/core/generateNextflowScript";
import { checkWorkflow } from "../pages/workflow/workflowCheck";
import { makeNode } from "../test/nodes";
import { defaultExecutionSettings } from "../workflows/defaultExecutionSettings";
import { cycleThroughConnection, describeCycle, findCycle } from "./workflowCycles";

const node = (id: string, definition: string, extra: Partial<NodeData> = {}) =>
  ({ ...makeNode(definition, { label: id, ...extra }), id }) as Node<NodeData>;
const edge = (source: string, sourceHandle: string, target: string): Edge => ({
  id: `${source}-${target}`,
  source,
  sourceHandle,
  target,
  targetHandle: "in",
});

// File Input → Merge → Map → back into Merge.
const nodes = [
  node("Reads", "fileInput", { files: [{ name: "a.txt", content: "x", size: 1 }] }),
  node("Merge", "merge"),
  node("Map", "map"),
];
const chain = [edge("Reads", "ch_files_out", "Merge"), edge("Merge", "out", "Map")];
const loop = [...chain, edge("Map", "out", "Merge")];

describe("loops in a workflow", () => {
  it("are found, through several nodes", () => {
    expect(findCycle(chain)).toBeNull();
    expect(findCycle(loop)).toEqual(["Merge", "Map", "Merge"]);
    expect(describeCycle(["Map", "Merge", "Map"], nodes)).toBe("“Map” → “Merge” → “Map”");
  });

  it("are seen in the connection that would close one", () => {
    const back = { source: "Map", sourceHandle: "out", target: "Merge", targetHandle: "in" };
    expect(cycleThroughConnection(back, chain)).toEqual(["Merge", "Map", "Merge"]);
    expect(cycleThroughConnection({ ...back, source: "Reads" }, chain)).toBeNull();
  });

  it("stop the run and can't be generated", () => {
    expect(
      checkWorkflow(nodes, loop, {
        missingNfCoreComponents: [],
        settings: defaultExecutionSettings,
        docker: null,
        nextflow: null,
        limits: null,
      }).find((problem) => problem.id === "cycle"),
    ).toMatchObject({ level: "error", nodeId: "Merge" });
    expect(() => generateNextflowScript(nodes, loop, "wf", "results", "{workflow_name}")).toThrow(
      "The workflow has a loop (“Merge” → “Map” → “Merge”), so its Nextflow script can't be written. Remove one of these connections.",
    );
  });
});
