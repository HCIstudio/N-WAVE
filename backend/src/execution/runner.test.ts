import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type RunExit, startRun } from "./runner";

// Real child processes: a shell stands in for Nextflow.
const run = (command: string, timeoutMs = 0, stopAfterMs?: number) =>
  new Promise<RunExit & { output: string }>((resolve) => {
    let output = "";
    const handle = startRun({
      command,
      cwd: os.tmpdir(),
      timeoutMs,
      onOutput: (chunk) => {
        output += chunk;
      },
      onExit: (exit) => resolve({ ...exit, output }),
    });
    if (stopAfterMs !== undefined) {
      setTimeout(() => handle.stop("cancelled"), stopAfterMs);
    }
  });

/** Running, not gone or a zombie waiting to be reaped. */
const isRunning = (pid: number) => {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.split(") ")[1]?.[0] !== "Z";
  } catch {
    return false;
  }
};

describe.skipIf(process.platform !== "linux")("startRun", () => {
  it("streams stdout and stderr and reports the exit code", async () => {
    const exit = await run("echo out; echo err >&2; exit 3");
    expect(exit.code).toBe(3);
    expect(exit.stopReason).toBeNull();
    expect(exit.output).toContain("out");
    expect(exit.output).toContain("err");
    expect(exit.outputTail).toBe(exit.output);
  });

  it("isn't limited by output size", async () => {
    // ~20 MB, twice the old exec() buffer.
    const exit = await run("head -c 20000000 /dev/zero | tr '\\\\0' 'x'");
    expect(exit.code).toBe(0);
    expect(exit.output.length).toBe(20_000_000);
    expect(exit.outputTail.length).toBe(1_000_000);
  });

  it("stops a run at its time limit", async () => {
    const started = Date.now();
    const exit = await run("sleep 30", 300);
    expect(exit.stopReason).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("cancels the whole process group", async () => {
    const pidFile = path.join(os.tmpdir(), `nwave-runner-${Date.now()}.pid`);
    // A grandchild like Nextflow's task processes.
    const exit = await run(`sh -c 'sleep 30 & echo $! > ${pidFile}; wait' & wait`, 0, 500);
    expect(exit.stopReason).toBe("cancelled");
    const grandchild = Number(fs.readFileSync(pidFile, "utf8"));
    fs.rmSync(pidFile);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(isRunning(grandchild)).toBe(false);
  });

  it("ends a stopped run only after cleaning up what it left behind", async () => {
    const order: string[] = [];
    const exit = await new Promise<RunExit>((resolve) => {
      const handle = startRun({
        command: "sleep 30",
        cwd: os.tmpdir(),
        timeoutMs: 0,
        cleanUpAfterStop: async () => {
          await new Promise((wait) => setTimeout(wait, 50));
          order.push("cleaned up");
        },
        onOutput: () => {},
        onExit: (result) => {
          order.push("ended");
          resolve(result);
        },
      });
      setTimeout(() => handle.stop("cancelled"), 200);
    });
    expect(exit.stopReason).toBe("cancelled");
    expect(order).toEqual(["cleaned up", "ended"]);
  });

  it("doesn't clean up after a run that finished on its own", async () => {
    let cleanedUp = false;
    await new Promise<RunExit>((resolve) =>
      startRun({
        command: "true",
        cwd: os.tmpdir(),
        timeoutMs: 0,
        cleanUpAfterStop: async () => {
          cleanedUp = true;
        },
        onOutput: () => {},
        onExit: resolve,
      }),
    );
    expect(cleanedUp).toBe(false);
  });
});
