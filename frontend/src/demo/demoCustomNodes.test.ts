import { beforeEach, describe, expect, it } from "vitest";
import type { StoredCustomNode } from "../registry/customNodes";
import demoApi from "./demoApi";

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
});
