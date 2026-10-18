import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Saved workflows are an in-memory list; custom nodes live in a temp directory.
interface FakeWorkflow {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  markModified: () => void;
  save: () => Promise<void>;
}
const workflows = vi.hoisted(() => ({ list: [] as FakeWorkflow[] }));
vi.mock("../models/WorkflowModel", () => ({
  default: { find: async () => workflows.list },
}));

import { createApp } from "../app";

const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-nodes-"));
const nodeDirectory = path.join(rootDirectory, "nodes");
const legacyPath = path.join(rootDirectory, "userCustomNodes.json");
const app = createApp();

// A node as a node pack import stores it: a custom node plus its pack.
const packNode = {
  id: "custom_head_lines_1",
  label: "Head lines",
  description: "First lines of a file",
  icon: "Code",
  processType: "custom_head_lines_1",
  processName: "HEAD_LINES",
  source: "process HEAD_LINES {\n  input:\n  path input_file\n  output:\n  path 'result.txt', emit: result\n  script:\n  \"head $input_file > result.txt\"\n}",
  inputs: [{ name: "input_file", kind: "path", label: "Input file" }],
  outputs: [{ name: "result", emit: "result", label: "Result" }],
  arguments: [
    { kind: "path", name: "input_file", fields: [{ kind: "path", name: "input_file" }] },
  ],
  pack: { id: "text-tools", name: "Text tools", version: "1.0.0" },
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
};

describe("/api/custom-nodes", () => {
  beforeAll(() => {
    process.env.NWAVE_CUSTOM_NODE_DIR = nodeDirectory;
  });
  beforeEach(() => {
    // Each test starts with no nodes and no legacy registry.
    for (const entry of fs.readdirSync(rootDirectory)) {
      fs.rmSync(path.join(rootDirectory, entry), { recursive: true, force: true });
    }
  });
  afterAll(() => {
    Reflect.deleteProperty(process.env, "NWAVE_CUSTOM_NODE_DIR");
    fs.rmSync(rootDirectory, { recursive: true, force: true });
  });

  it("keeps a pack node's pack and settings when saving and listing", async () => {
    const created = await request(app)
      .post("/api/custom-nodes")
      .send({ node: packNode })
      .expect(201);
    expect(created.body.node).toEqual(packNode);

    const listed = await request(app).get("/api/custom-nodes").expect(200);
    expect(listed.body.nodes).toEqual([packNode]);

    // Importing the pack again replaces the node.
    await request(app)
      .post("/api/custom-nodes")
      .send({ node: { ...packNode, pack: { ...packNode.pack, version: "1.1.0" } } })
      .expect(200);
    const updated = await request(app).get("/api/custom-nodes").expect(200);
    expect(updated.body.nodes[0].pack.version).toBe("1.1.0");

    await request(app).delete(`/api/custom-nodes/${packNode.id}`).expect(200);
    const empty = await request(app).get("/api/custom-nodes").expect(200);
    expect(empty.body.nodes).toEqual([]);
  });

  const save = (node: Record<string, unknown>) =>
    request(app).post("/api/custom-nodes").send({ node });

  it("rejects arguments that aren't argument objects", async () => {
    const response = await save({ ...packNode, arguments: [null] }).expect(400);
    expect(response.body.details[0]).toMatch(/^node\.arguments\.0:/);
    await save({
      ...packNode,
      arguments: [{ kind: "tuple", name: "x", fields: [null] }],
    }).expect(400);
  });

  it("rejects ids the client wouldn't accept, and ids sharing a file", async () => {
    await save({ ...packNode, id: "工具" }).expect(400);
    await save({ ...packNode, id: "my tool" }).expect(400);

    await save({ ...packNode, id: "my-tool" }).expect(201);
    const clash = await save({ ...packNode, id: "My.Tool" }).expect(409);
    expect(clash.body.message).toMatch(/clashes with the existing node "my-tool"/);
    await request(app).delete("/api/custom-nodes/My.Tool").expect(404);
    const listed = await request(app).get("/api/custom-nodes").expect(200);
    expect(listed.body.nodes.map((node: { id: string }) => node.id)).toEqual([
      "my-tool",
    ]);
    await request(app).delete("/api/custom-nodes/my-tool").expect(200);
  });

  it("rejects ids of built-in and nf-core nodes", async () => {
    for (const id of ["fastqc", "FastQC", "outputDisplay", "nfcore_fastqc"]) {
      const response = await save({ ...packNode, id }).expect(400);
      expect(response.body.error).toMatch(/reserved/);
    }
    await save({ ...packNode, processType: "trimmomatic" }).expect(400);
  });

  it("caps the source at the client's limit", async () => {
    await save({ ...packNode, source: "x".repeat(500_001) }).expect(400);
  });

  it("leaves the node file alone when updating workflows fails", async () => {
    workflows.list = [
      {
        nodes: [{ id: "n1", data: { customNodeId: packNode.id } }],
        edges: [],
        markModified: () => {},
        save: async () => {
          throw new Error("document too large");
        },
      },
    ];
    try {
      await save(packNode).expect(500);
    } finally {
      workflows.list = [];
    }
    expect(fs.existsSync(path.join(nodeDirectory, `${packNode.id}.json`))).toBe(
      false
    );
  });

  it("drops edges to removed ports at both ends, between two instances", async () => {
    const workflow: FakeWorkflow = {
      nodes: [
        { id: "n1", data: { customNodeId: packNode.id } },
        { id: "n2", data: { customNodeId: packNode.id } },
      ],
      edges: [
        {
          id: "ok",
          source: "n1",
          sourceHandle: "result",
          target: "n2",
          targetHandle: "input_file",
        },
        {
          id: "gone",
          source: "n1",
          sourceHandle: "result",
          target: "n2",
          targetHandle: "removed_input",
        },
      ],
      markModified: () => {},
      save: async () => {},
    };
    workflows.list = [workflow];
    try {
      await save(packNode).expect(201);
    } finally {
      workflows.list = [];
    }
    expect(workflow.edges.map((edge) => edge.id)).toEqual(["ok"]);
    await request(app).delete(`/api/custom-nodes/${packNode.id}`).expect(200);
  });

  it("migrates the legacy registry once, so deleted nodes stay deleted", async () => {
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({ schemaVersion: 1, nodes: [{ ...packNode, id: "legacy_node" }] })
    );
    const listed = await request(app).get("/api/custom-nodes").expect(200);
    expect(listed.body.nodes.map((node: { id: string }) => node.id)).toEqual([
      "legacy_node",
    ]);
    expect(fs.existsSync(legacyPath)).toBe(false);
    expect(fs.existsSync(`${legacyPath}.migrated`)).toBe(true);

    await request(app).delete("/api/custom-nodes/legacy_node").expect(200);
    const after = await request(app).get("/api/custom-nodes").expect(200);
    expect(after.body.nodes).toEqual([]);
  });
});
