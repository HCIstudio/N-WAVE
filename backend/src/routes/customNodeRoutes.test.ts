import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// No saved workflows use the nodes; custom nodes live in a temp directory.
vi.mock("../models/WorkflowModel", () => ({
  default: { find: async () => [] },
}));

import { createApp } from "../app";

const nodeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-nodes-"));
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
  afterAll(() => {
    Reflect.deleteProperty(process.env, "NWAVE_CUSTOM_NODE_DIR");
    fs.rmSync(nodeDirectory, { recursive: true, force: true });
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
});
