import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listRuns, listUnfinishedRuns, RUN_LOG_FILE, recordRun, recordRunProcess } from "../runs/runIndex";
import { INTERRUPTED_MESSAGE, stopOrphanedRuns } from "./orphanedRuns";
import { getLiveRun, isRunLive, registerRun, stopAllRuns, unregisterRun } from "./runRegistry";

const isAlive = (pid: number) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("runs an earlier backend left behind", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-orphans-"));
    vi.stubEnv("NWAVE_DATA_DIR", path.join(root, "data"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const runDir = (name: string) => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, RUN_LOG_FILE), "N-WAVE run: x\n");
    return dir;
  };

  // A stand-in for a local Nextflow left running: its own process group,
  // working in the run's folder.
  const leftRunning = (dir: string) => {
    const child = spawn("sleep 120", { cwd: dir, shell: true, detached: true, stdio: "ignore" });
    child.unref();
    return child.pid as number;
  };

  it.skipIf(process.platform !== "linux")(
    "stops what is left of them and records them as interrupted",
    async () => {
      const dir = runDir("flow_1");
      const group = leftRunning(dir);
      recordRun("flow_1", dir, { workflowId: "wf" });
      recordRunProcess("flow_1", { processGroup: group });
      expect(listUnfinishedRuns()).toEqual([{ id: "flow_1", dir, processGroup: group }]);

      expect(await stopOrphanedRuns()).toBe(1);
      await vi.waitFor(() => expect(isAlive(group)).toBe(false));
      const [run] = listRuns({ isLive: isRunLive });
      expect(run).toMatchObject({ id: "flow_1", status: "failed", message: INTERRUPTED_MESSAGE });
      expect(fs.readFileSync(path.join(dir, RUN_LOG_FILE), "utf8")).toContain(INTERRUPTED_MESSAGE);
      expect(listUnfinishedRuns()).toEqual([]);
      expect(isRunLive("flow_1")).toBe(false);
    },
    40_000
  );

  it.skipIf(process.platform !== "linux")(
    "leaves alone a process that got the recorded id but isn't the run",
    async () => {
      // Works elsewhere: the id was reused after the run's Nextflow ended.
      const other = leftRunning(runDir("elsewhere"));
      const dir = runDir("flow_2");
      recordRun("flow_2", dir);
      recordRunProcess("flow_2", { processGroup: other });

      await stopOrphanedRuns();
      expect(isAlive(other)).toBe(true);
      expect(listRuns()[0]).toMatchObject({ status: "failed" });
      process.kill(-other, "SIGKILL");
    },
    40_000
  );
});

describe("stopping every run on shutdown", () => {
  it("stops each live run and waits for it to end", async () => {
    const stop = vi.fn((reason: string) => {
      expect(reason).toBe("shutdown");
      setTimeout(() => unregisterRun("r1"), 50);
    });
    registerRun("r1", { stop });
    expect(await stopAllRuns(5_000)).toBe(1);
    expect(stop).toHaveBeenCalledOnce();
    expect(getLiveRun("r1")).toBeUndefined();
  });

  it("gives up waiting after its time limit", async () => {
    registerRun("stuck", { stop: () => {} });
    const started = Date.now();
    await stopAllRuns(200);
    expect(Date.now() - started).toBeLessThan(2_000);
    unregisterRun("stuck");
  });
});
