import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findRunLog,
  finishRun,
  listRuns,
  RUN_LOG_FILE,
  recordRun,
} from "./runIndex";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-runs-"));

describe("run index", () => {
  beforeAll(() => {
    process.env.NWAVE_DATA_DIR = path.join(root, "data");
  });
  afterAll(() => {
    Reflect.deleteProperty(process.env, "NWAVE_DATA_DIR");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("lists a workflow's runs newest first, with how they ended", () => {
    const dir = (name: string) => {
      const runDir = path.join(root, name);
      fs.mkdirSync(runDir, { recursive: true });
      return runDir;
    };
    recordRun("a_1", dir("a_1"), { workflowId: "wf-a", workflowName: "A" });
    recordRun("b_1", dir("b_1"), { workflowId: "wf-b", workflowName: "B" });
    recordRun("a_2", dir("a_2"), { workflowId: "wf-a", workflowName: "A" });
    recordRun("a_3", dir("a_3"), { workflowId: "wf-a", workflowName: "A" });
    finishRun("a_1", "succeeded");
    finishRun("a_2", "failed", "Process `HELLO` terminated with an error exit status (127)");

    const runs = listRuns({ workflowId: "wf-a", isLive: (id) => id === "a_3" });
    expect(runs.map((run) => [run.id, run.status])).toEqual([
      ["a_3", "running"],
      ["a_2", "failed"],
      ["a_1", "succeeded"],
    ]);
    expect(runs[1]).toMatchObject({
      workflowName: "A",
      message: "Process `HELLO` terminated with an error exit status (127)",
    });
    expect(runs[1].finishedAt).toBeDefined();

    // After a server restart a "running" run isn't going any more.
    expect(listRuns({ workflowId: "wf-a", isLive: () => false })[0]).toMatchObject({
      id: "a_3",
      status: "failed",
      message: "The run was interrupted (the server stopped).",
    });
    expect(listRuns().map((run) => run.id)).toEqual(["a_3", "a_2", "b_1", "a_1"]);
  });

  it("finds a run's log file", () => {
    expect(findRunLog("a_1")).toBeNull();
    fs.writeFileSync(path.join(root, "a_1", RUN_LOG_FILE), "N-WAVE run: a_1\n");
    expect(findRunLog("a_1")).toBe(path.join(root, "a_1", RUN_LOG_FILE));
    expect(findRunLog("missing")).toBeNull();
  });
});
