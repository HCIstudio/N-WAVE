import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app";

// These tests only exercise request validation; no Nextflow or Docker runs.
const app = createApp();

describe("POST /api/execute/execute validation", () => {
  it("requires a script", async () => {
    const response = await request(app)
      .post("/api/execute/execute")
      .send({ workflowName: "x" })
      .expect(400);
    expect(response.body.error).toBe("Script or nextflowScript is required");
  });

  it.each(["../escape.txt", "dir/file.txt", "..", "a\\b.txt"])(
    "rejects input file name %s",
    async (fileName) => {
      const response = await request(app)
        .post("/api/execute/execute")
        .send({ nextflowScript: "workflow {}", fileContent: { [fileName]: "x" } })
        .expect(400);
      expect(response.body.details.join(" ")).toContain("fileContent");
    }
  );

  it.each([
    ["nextflowVersion", "25.04.4; rm -rf /"],
    ["maxMemory", '4GB" && touch /tmp/x'],
    ["containerImage", "ubuntu; reboot"],
    ["outputNaming", "../../etc"],
    ["maxCpus", 0],
  ])("rejects unsafe executionSettings.%s", async (field, value) => {
    const response = await request(app)
      .post("/api/execute/execute")
      .send({
        nextflowScript: "workflow {}",
        executionSettings: { [field]: value },
      })
      .expect(400);
    expect(response.body.details.join(" ")).toContain(field);
  });

  it("rejects legacy inline templates with a 400 instead of hanging", async () => {
    const response = await request(app)
      .post("/api/execute/execute")
      .send({ nextflowScript: "echo 'Downloading FastQC'" })
      .expect(400);
    expect(response.body.error).toMatch(/legacy inline/);
  });
});

describe("POST /api/execute/cancel", () => {
  it("requires an execution id", async () => {
    const response = await request(app)
      .post("/api/execute/cancel")
      .send({})
      .expect(400);
    expect(response.body.error).toBe("Execution ID is required");
  });

  it("reports unknown executions", async () => {
    await request(app)
      .post("/api/execute/cancel")
      .send({ executionId: "nope" })
      .expect(404);
  });
});
