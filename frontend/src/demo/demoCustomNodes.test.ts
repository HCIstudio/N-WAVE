import { beforeEach, describe, expect, it } from "vitest";
import type { StoredCustomNode } from "../registry/customNodes";
import type { WorkflowDescriptor } from "../types/backend";
import demoApi from "./demoApi";
import { demoStore } from "./demoStore";

const node = (id: string, label: string) =>
  ({ id, label, source: "process X {}" }) as StoredCustomNode;

describe("demo custom nodes", () => {
  beforeEach(() => localStorage.clear());

  it("saves, lists, updates and deletes custom nodes", async () => {
    await demoApi.post("/custom-nodes", { node: node("b", "Beta") });
    await demoApi.post("/custom-nodes", { node: node("a", "Alpha") });
    await demoApi.post("/custom-nodes", { node: node("b", "Beta 2") });

    const listed = await demoApi.get<{ nodes: StoredCustomNode[] }>(
      "/api/custom-nodes",
    );
    expect(listed.data.nodes.map((entry) => entry.label)).toEqual([
      "Alpha",
      "Beta 2",
    ]);

    await demoApi.delete("/custom-nodes/a");
    const after = await demoApi.get<{ nodes: StoredCustomNode[] }>(
      "/custom-nodes",
    );
    expect(after.data.nodes.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("reports missing nodes and invalid payloads", async () => {
    await expect(demoApi.delete("/custom-nodes/missing")).rejects.toMatchObject(
      {
        response: { status: 404 },
      },
    );
    await expect(
      demoApi.post("/custom-nodes", { node: { label: "No id" } }),
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it("updates and purges placed instances in saved workflows", async () => {
    const definition = (outputs: string[]) =>
      ({
        ...node("tool", "Tool"),
        inputs: [{ name: "reads", kind: "path", label: "Reads" }],
        outputs: outputs.map((name) => ({ name, emit: name, label: name })),
      }) as StoredCustomNode;
    const instance = (id: string) => ({
      id,
      type: "process",
      position: { x: 0, y: 0 },
      data: { label: "Tool", customNodeId: "tool", inputs: [], outputs: [] },
    });
    await demoApi.post("/custom-nodes", { node: definition(["bam", "log"]) });
    const workflow = demoStore.create({
      name: "Uses tool",
      nodes: [instance("t1"), instance("t2"), instance("other")].map(
        (entry, index) =>
          index === 2
            ? { ...entry, data: { label: "Other", inputs: [], outputs: [] } }
            : entry,
      ) as WorkflowDescriptor["nodes"],
      edges: [
        // instance -> instance over the output that is about to be removed
        {
          id: "e1",
          source: "t1",
          sourceHandle: "log",
          target: "t2",
          targetHandle: "reads",
        },
        { id: "e2", source: "t1", sourceHandle: "bam", target: "other" },
        // valid source port, but the target port no longer exists
        {
          id: "e4",
          source: "t1",
          sourceHandle: "bam",
          target: "t2",
          targetHandle: "gone",
        },
        { id: "e3", source: "other", target: "t2", targetHandle: "reads" },
      ],
    });

    const saved = await demoApi.post<{
      updatedWorkflows: number;
      workflows: unknown[];
    }>("/custom-nodes", { node: { ...definition(["bam"]), label: "Tool 2" } });
    expect(saved.data.updatedWorkflows).toBe(1);
    // As the backend: which workflows moved to which revision.
    expect(saved.data.workflows).toEqual([{ id: workflow._id, from: 0, to: 1 }]);
    const updated = demoStore.get(workflow._id);
    expect(updated?.nodes.find((n) => n.id === "t1")?.data).toMatchObject({
      label: "Tool 2",
      inputs: [{ name: "reads" }],
      outputs: [{ name: "bam" }],
    });
    expect(updated?.edges.map((edge) => edge.id)).toEqual(["e2", "e3"]);

    const deleted = await demoApi.delete<{ workflows: unknown[] }>(
      "/custom-nodes/tool",
    );
    expect(deleted.data.workflows).toEqual([{ id: workflow._id, from: 1, to: 2 }]);
    const purged = demoStore.get(workflow._id);
    expect(purged?.nodes.map((n) => n.id)).toEqual(["other"]);
    expect(purged?.edges).toEqual([]);
  });

  it("ignores malformed stored entries", async () => {
    localStorage.setItem(
      "nwave.demo.customNodes",
      JSON.stringify([null, 3, { label: "No id" }, node("a", "Alpha")]),
    );
    const listed = await demoApi.get<{ nodes: StoredCustomNode[] }>(
      "/custom-nodes",
    );
    expect(listed.data.nodes.map((entry) => entry.id)).toEqual(["a"]);
  });
});
