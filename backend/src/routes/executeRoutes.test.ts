import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { recordRun } from "../runs/runIndex";

// These tests only exercise request validation; no Nextflow or Docker runs.
const app = createApp();

describe("POST /api/execute/execute validation", () => {
  it("requires a script", async () => {
    const response = await request(app)
      .post("/api/execute/execute")
      .send({ workflowName: "x" })
      .expect(400);
    expect(response.body.error).toBe("Script, nextflowScript or pipeline is required");
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

describe("pipeline run requests", () => {
  it.each([
    [{ name: "rnaseq; rm -rf /", version: "3.27.0", profiles: ["docker"] }, "name"],
    [{ name: "rnaseq", version: "3.27.0 && x", profiles: ["docker"] }, "version"],
    [{ name: "rnaseq", version: "3.27.0", profiles: ["docker,evil x"] }, "profiles"],
    [
      { name: "rnaseq", version: "3.27.0", profiles: ["docker"], params: { "a b": 1 } },
      "params",
    ],
  ])("rejects unsafe pipeline %j", async (pipeline, field) => {
    const response = await request(app)
      .post("/api/execute/execute")
      .send({ pipeline })
      .expect(400);
    expect(response.body.details.join(" ")).toContain(field);
  });
});

describe("run results", () => {
  let dataDir: string;
  let runDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-runs-"));
    vi.stubEnv("NWAVE_DATA_DIR", dataDir);
    runDir = path.join(dataDir, "run1");
    fs.mkdirSync(path.join(runDir, "results/multiqc/star_salmon"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(runDir, "results/multiqc/star_salmon/multiqc_report.html"),
      "<html>report</html>"
    );
    fs.writeFileSync(path.join(runDir, "secret.txt"), "outside results");
    recordRun("rnaseq_1", runDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("lists and serves a recorded run's results", async () => {
    const list = await request(app)
      .get("/api/execute/runs/rnaseq_1/files")
      .expect(200);
    expect(list.body.files).toEqual([
      { path: "multiqc/star_salmon/multiqc_report.html", size: 19 },
    ]);

    const file = await request(app)
      .get("/api/execute/runs/rnaseq_1/file")
      .query({ path: "multiqc/star_salmon/multiqc_report.html" })
      .expect(200);
    expect(file.text).toBe("<html>report</html>");
    expect(file.headers["content-security-policy"]).toContain("sandbox");
  });

  it("serves nothing outside a recorded run's results", async () => {
    await request(app).get("/api/execute/runs/unknown/files").expect(404);
    await request(app).get("/api/execute/runs/bad..id/files").expect(400);
    for (const filePath of ["../secret.txt", "/etc/passwd", "", "multiqc"]) {
      await request(app)
        .get("/api/execute/runs/rnaseq_1/file")
        .query({ path: filePath })
        .expect(404);
    }
  });
});
