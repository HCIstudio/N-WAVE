import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { recordRun } from "../runs/runIndex";

const app = createApp();

describe("run files behind symlinks", () => {
  let root: string;
  let runDir: string;
  let workDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-symlinks-"));
    vi.stubEnv("NWAVE_DATA_DIR", path.join(root, "data"));
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");

    runDir = path.join(root, "run1");
    workDir = path.join(runDir, "nextflow/work/1f/9a15a4aa");
    fs.mkdirSync(workDir, { recursive: true });
    fs.mkdirSync(path.join(runDir, "results"), { recursive: true });
    fs.writeFileSync(path.join(workDir, "out.txt"), "output");
    fs.writeFileSync(
      path.join(runDir, "nextflow/.nextflow.log"),
      "[1f/9a15a4] Submitted process > HELLO (1)\n"
    );
    // Nextflow's default publishDir mode: a symlink into the run's work/.
    fs.symlinkSync(path.join(workDir, "out.txt"), path.join(runDir, "results/out.txt"));
    // Escapes: a symlinked file, a symlinked directory mid-path, a staged dir.
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(runDir, "results/leak.txt"));
    fs.symlinkSync(outside, path.join(runDir, "results/linked"));
    fs.symlinkSync(outside, path.join(workDir, "staged"));
    recordRun("flow_1", runDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("lists and serves results symlinked into the run", async () => {
    const list = await request(app).get("/api/execute/runs/flow_1/files").expect(200);
    expect(list.body.files).toEqual([{ path: "out.txt", size: 6 }]);
    const file = await request(app).get("/api/execute/runs/flow_1/results/out.txt").expect(200);
    expect(file.text).toBe("output");
    await request(app).get("/api/execute/runs/flow_1/results/leak.txt").expect(404);
    await request(app).get("/api/execute/runs/flow_1/results/%2e%2e/%2e%2e/etc/passwd").expect(404);
    const task = await request(app)
      .get("/api/execute/runs/flow_1/tasks/1f/9a15a4/output/out.txt")
      .expect(200);
    expect(task.text).toBe("output");
    await request(app).get("/api/execute/runs/flow_1/tasks/1f/9a15a4/output/staged/secret.txt").expect(404);
  });

  it("serves nothing a symlink points to outside the run", async () => {
    for (const filePath of ["leak.txt", "linked/secret.txt", "missing.txt"]) {
      await request(app)
        .get(`/api/execute/runs/flow_1/results/${encodeURIComponent(filePath)}`)
        .expect(404);
    }
    await request(app)
      .get("/api/execute/runs/flow_1/tasks/1f/9a15a4/file")
      .query({ path: "staged/secret.txt" })
      .expect(404);
    const file = await request(app)
      .get("/api/execute/runs/flow_1/tasks/1f/9a15a4/file")
      .query({ path: "out.txt" })
      .expect(200);
    expect(file.text).toBe("output");
  });
});

describe("following a run's log", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-follow-"));
    vi.stubEnv("NWAVE_DATA_DIR", path.join(root, "data"));
    fs.writeFileSync(path.join(root, "nwave-run.log"), "N-WAVE run: follow_1\nline one\n");
    recordRun("follow_1", root);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("sends what came after a byte offset, where to go on, and whether the run is live", async () => {
    const all = await request(app).get("/api/execute/runs/follow_1/log").expect(200);
    expect(all.text).toBe("N-WAVE run: follow_1\nline one\n");
    expect(all.headers["x-run-live"]).toBe("0");
    const end = Number(all.headers["x-log-end"]);
    expect(end).toBe(Buffer.byteLength(all.text));

    fs.appendFileSync(path.join(root, "nwave-run.log"), "line two ✔\n");
    const more = await request(app).get(`/api/execute/runs/follow_1/log?from=${end}`).expect(200);
    expect(more.text).toBe("line two ✔\n");
    expect(Number(more.headers["x-log-end"])).toBe(end + Buffer.byteLength("line two ✔\n"));

    const none = await request(app)
      .get(`/api/execute/runs/follow_1/log?from=${more.headers["x-log-end"]}`)
      .expect(200);
    expect(none.text).toBe("");
  });
});
