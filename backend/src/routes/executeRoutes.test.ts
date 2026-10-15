import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { finishRun, recordRun, RUN_LOG_FILE } from "../runs/runIndex";

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

describe("run history", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-history-"));
    vi.stubEnv("NWAVE_DATA_DIR", dataDir);
    const runDir = path.join(dataDir, "bee_1");
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, RUN_LOG_FILE), "N-WAVE run: bee_1\nERROR ~ boom\n");
    recordRun("bee_1", runDir, { workflowId: "wf1", workflowName: "Bee" });
    finishRun("bee_1", "failed", "ERROR ~ boom");
    recordRun("other_1", path.join(dataDir, "other_1"), { workflowId: "wf2" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("lists a workflow's runs with their outcome", async () => {
    const response = await request(app)
      .get("/api/execute/runs")
      .query({ workflowId: "wf1" })
      .expect(200);
    expect(response.body.runs).toEqual([
      expect.objectContaining({
        id: "bee_1",
        workflowName: "Bee",
        status: "failed",
        message: "ERROR ~ boom",
      }),
    ]);
  });

  it("lists a run's tasks and serves the files they produced", async () => {
    const runDir = path.join(dataDir, "bee_1");
    const workDir = path.join(runDir, "nextflow/work/1f/9a15a4aa");
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, "barry.txt"), "Barry");
    fs.writeFileSync(path.join(workDir, ".command.sh"), "grep Barry");
    fs.writeFileSync(
      path.join(runDir, "nextflow/.nextflow.log"),
      "Oct-15 15:28:58.078 [Task submitter] INFO  nextflow.Session - [1f/9a15a4] Submitted process > filter_demo_filter_barry (1)\n"
    );

    const tasks = await request(app).get("/api/execute/runs/bee_1/tasks").expect(200);
    expect(tasks.body.tasks).toEqual([
      expect.objectContaining({ hash: "1f/9a15a4", process: "filter_demo_filter_barry", status: "running" }),
    ]);
    const files = await request(app)
      .get("/api/execute/runs/bee_1/tasks/1f/9a15a4/files")
      .expect(200);
    expect(files.body.files).toEqual([{ path: "barry.txt", size: 5 }]);
    const file = await request(app)
      .get("/api/execute/runs/bee_1/tasks/1f/9a15a4/file")
      .query({ path: "barry.txt" })
      .expect(200);
    expect(file.text).toBe("Barry");
    for (const filePath of [".command.sh", "../../../bee_1/nwave-run.log", ""]) {
      await request(app)
        .get("/api/execute/runs/bee_1/tasks/1f/9a15a4/file")
        .query({ path: filePath })
        .expect(404);
    }
    await request(app).get("/api/execute/runs/bee_1/tasks/zz/9a15a4/files").expect(404);
    await request(app).get("/api/execute/runs/unknown/tasks").expect(404);
  });

  it("serves a run's log", async () => {
    const log = await request(app).get("/api/execute/runs/bee_1/log").expect(200);
    expect(log.text).toContain("ERROR ~ boom");
    expect(log.headers["content-type"]).toContain("text/plain");
    await request(app).get("/api/execute/runs/other_1/log").expect(404);
    await request(app).get("/api/execute/runs/bad..id/log").expect(400);
  });
});

describe("GET /api/execute/limits", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports the server's limits", async () => {
    vi.stubEnv("NWAVE_MAX_CPUS", "12");
    vi.stubEnv("NWAVE_MAX_MEMORY", "48 GB");
    vi.stubEnv("NWAVE_EXECUTION_TIMEOUT", "0");
    const response = await request(app).get("/api/execute/limits").expect(200);
    expect(response.body).toEqual({
      maxCpus: 12,
      maxMemory: "48.GB",
      maxMemoryBytes: 48 * 1024 ** 3,
      source: { cpus: "env", memory: "env" },
      defaultTimeoutMinutes: 0,
    });
  });
});
