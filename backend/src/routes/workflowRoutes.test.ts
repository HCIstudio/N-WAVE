import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Replace the Mongoose model with an in-memory fake so the routes can be
// exercised without a database.
const { store, WorkflowModelMock } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  let nextId = 1;
  const toId = () => (nextId++).toString(16).padStart(24, "0");

  class WorkflowModelMock {
    [key: string]: unknown;

    constructor(data: Record<string, unknown>) {
      Object.assign(this, { nodes: [], edges: [], ...data, _id: toId() });
    }

    async save() {
      store.set(String(this._id), { ...this });
      return this;
    }

    static async find() {
      return [...store.values()];
    }

    static async findById(id: string) {
      return store.get(id) ?? null;
    }

    static async findByIdAndUpdate(id: string, update: Record<string, unknown>) {
      const existing = store.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...update };
      store.set(id, updated);
      return updated;
    }

    static async findByIdAndDelete(id: string) {
      const existing = store.get(id) ?? null;
      store.delete(id);
      return existing;
    }
  }

  return { store, WorkflowModelMock };
});

vi.mock("../models/WorkflowModel", () => ({ default: WorkflowModelMock }));

import { createApp } from "../app";

const app = createApp();
const missingId = "ffffffffffffffffffffffff";

describe("/api/workflows", () => {
  beforeEach(() => {
    store.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("creates and fetches a workflow", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({ name: "  My flow  ", nodes: [{ id: "a" }], edges: [] })
      .expect(201);

    expect(created.body).toMatchObject({
      name: "My flow",
      nodes: [{ id: "a" }],
      origin: { type: "database", readOnly: false },
    });

    const fetched = await request(app)
      .get(`/api/workflows/${created.body._id}`)
      .expect(200);
    expect(fetched.body.name).toBe("My flow");
  });

  it("lists built-in workflows before saved ones", async () => {
    await request(app)
      .post("/api/workflows")
      .send({ name: "Saved", nodes: [], edges: [] })
      .expect(201);

    const response = await request(app).get("/api/workflows").expect(200);
    expect(response.body[0].isBuiltin).toBe(true);
    expect(response.body.slice(0, 3).map((workflow: { _id: string }) => workflow._id)).toEqual([
      "builtin:demo-basic",
      "builtin:rnaseq-pipeline",
      "builtin:rnaseq-star-salmon",
    ]);
    expect(response.body.at(-1).name).toBe("Saved");
  });

  it("serves the RNA-seq (STAR + Salmon) example built from nf-core nodes", async () => {
    const response = await request(app)
      .get("/api/workflows/builtin:rnaseq-star-salmon")
      .expect(200);
    expect(response.body).toMatchObject({
      name: "RNA-seq (STAR + Salmon)",
      isBuiltin: true,
      isReadOnly: true,
      executionSettings: { resources: { maxCpus: 4, maxMemory: "8.GB" } },
    });
    const components = response.body.nodes
      .map((node: { data: { nwaveNfCoreModuleId?: string } }) => node.data.nwaveNfCoreModuleId)
      .filter(Boolean);
    expect(components).toEqual(
      expect.arrayContaining(["nf-core/star/align", "nf-core/salmon/quant", "nf-core/multiqc"])
    );
    await request(app).delete("/api/workflows/builtin:rnaseq-star-salmon").expect(403);
  });

  it("serves the nf-core/rnaseq example, read-only and with its resources", async () => {
    const response = await request(app)
      .get("/api/workflows/builtin:rnaseq-pipeline")
      .expect(200);
    expect(response.body).toMatchObject({
      isBuiltin: true,
      isReadOnly: true,
      origin: { type: "builtin", sourceFormat: "visual" },
      executionSettings: { resources: { maxCpus: 4, maxMemory: "8.GB" } },
    });
    const pipeline = response.body.nodes.find(
      (node: { type: string }) => node.type === "pipeline"
    );
    expect(pipeline.data).toMatchObject({
      pipelineName: "rnaseq",
      pipelineVersion: "3.27.0",
      pipelineTestProfile: true,
    });
    expect(response.body.edges).toHaveLength(3);
    await request(app)
      .put("/api/workflows/builtin:rnaseq-pipeline")
      .send({ name: "x" })
      .expect(403);
  });

  it.each([
    [{ nodes: [] }, "edges"],
    [{ nodes: "nope", edges: [] }, "nodes"],
    [{ nodes: [], edges: [], name: "x".repeat(201) }, "name"],
    [{ nodes: [], edges: [], originType: "hacked" }, "originType"],
  ])("rejects invalid create body %j", async (body, field) => {
    const response = await request(app)
      .post("/api/workflows")
      .send(body)
      .expect(400);
    expect(response.body.message).toBe("Invalid request body");
    expect(response.body.details.join(" ")).toContain(field);
  });

  it("updates a workflow partially", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({ name: "Before", nodes: [], edges: [] });

    const updated = await request(app)
      .put(`/api/workflows/${created.body._id}`)
      .send({ name: "After" })
      .expect(200);
    expect(updated.body.name).toBe("After");
  });

  it("rejects an empty update", async () => {
    const response = await request(app)
      .put(`/api/workflows/${missingId}`)
      .send({})
      .expect(400);
    expect(response.body.details).toContain("No update data provided");
  });

  it("refuses to modify built-in workflows", async () => {
    await request(app)
      .put("/api/workflows/builtin:demo-basic")
      .send({ name: "x" })
      .expect(403);
    await request(app).delete("/api/workflows/builtin:demo-basic").expect(403);
  });

  it("validates ids and reports missing workflows", async () => {
    await request(app).get("/api/workflows/not-an-id").expect(400);
    await request(app).get(`/api/workflows/${missingId}`).expect(404);
    await request(app).delete(`/api/workflows/${missingId}`).expect(404);
  });

  it("duplicates a built-in workflow into an editable copy", async () => {
    const response = await request(app)
      .post("/api/workflows/builtin:demo-basic/duplicate")
      .expect(201);
    expect(response.body).toMatchObject({ isBuiltin: false, isReadOnly: false });
    expect(response.body.name).toMatch(/ Copy$/);
    expect(store.size).toBe(1);
  });

  it("deletes a saved workflow", async () => {
    const created = await request(app)
      .post("/api/workflows")
      .send({ nodes: [], edges: [] });
    await request(app).delete(`/api/workflows/${created.body._id}`).expect(200);
    expect(store.size).toBe(0);
  });

  it("returns JSON for malformed request bodies", async () => {
    const response = await request(app)
      .post("/api/workflows")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
    expect(response.body.message).toBe("Request failed");
  });
});
