import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listRuns, RUN_LOG_FILE } from "../runs/runIndex";
import { prepareScriptRun } from "./prepareRun";
import { getLiveRun, isRunLive } from "./runRegistry";
import { startRun } from "./runner";
import { runNextflowWorkflow } from "./runWorkflow";

vi.mock("./prepareRun", () => ({
  preparePipelineRun: vi.fn(),
  prepareScriptRun: vi.fn(),
}));
vi.mock("./nextflowLauncher", () => ({
  buildNextflowLaunch: vi.fn(async () => ({ command: "true" })),
}));
vi.mock("./runner", () => ({ startRun: vi.fn() }));

const fakeResponse = () => {
  const res = {
    headersSent: false,
    output: "",
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    writeHead: vi.fn(() => {
      res.headersSent = true;
      return res;
    }),
    write: vi.fn((text: string) => {
      res.output += text;
      return true;
    }),
    end: vi.fn(),
  };
  return res;
};

describe("runNextflowWorkflow setup", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-setup-"));
    vi.stubEnv("NWAVE_DATA_DIR", path.join(root, "data"));
  });
  afterEach(async () => {
    // Let the run logs open before their folders go.
    for (const name of ["same", "same_2"]) {
      const dir = path.join(root, name);
      if (fs.existsSync(dir)) {
        await vi.waitFor(() => expect(fs.existsSync(path.join(dir, RUN_LOG_FILE))).toBe(true));
      }
    }
    vi.unstubAllEnvs();
    vi.mocked(prepareScriptRun).mockReset();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const run = (workflowName: string, res = fakeResponse()) =>
    runNextflowWorkflow(
      {
        nextflowScript: "workflow {}",
        workflowName,
        settings: { outputDirectory: root, outputNaming: "same" } as never,
      },
      res as unknown as Response
    ).then(() => res);

  it("gives each run its own folder, live while it is set up", async () => {
    const seen: Array<{ dir: string; status: string }> = [];
    vi.mocked(prepareScriptRun).mockImplementation(async (dirs) => {
      seen.push({
        dir: dirs.main,
        status: listRuns({ isLive: isRunLive })[0]?.status ?? "",
      });
      throw new Error("boom");
    });

    const res = await run("a");
    await run("b");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(seen).toEqual([
      { dir: path.join(root, "same"), status: "running" },
      { dir: path.join(root, "same_2"), status: "running" },
    ]);
    const runs = listRuns({ isLive: isRunLive });
    expect(runs.map((entry) => [entry.status, entry.message])).toEqual([
      ["failed", "boom"],
      ["failed", "boom"],
    ]);
    expect(runs.some((entry) => isRunLive(entry.id))).toBe(false);
  });

  it("can be cancelled while it is set up", async () => {
    vi.mocked(prepareScriptRun).mockImplementation(async () => {
      const id = listRuns()[0]?.id ?? "";
      getLiveRun(id)?.stop("cancelled");
      return { hasNfCoreModules: false, useProcessDocker: false };
    });
    const res = await run("c");
    expect(startRun).not.toHaveBeenCalled();
    expect(res.output).toContain("Execution cancelled");
    const [entry] = listRuns({ isLive: isRunLive });
    expect(entry?.status).toBe("cancelled");
    expect(isRunLive(entry?.id ?? "")).toBe(false);
  });
});
