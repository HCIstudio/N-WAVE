import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listRuns, RUN_LOG_FILE } from "../runs/runIndex";
import { buildNextflowLaunch } from "./nextflowLauncher";
import { passLaunchGate } from "./launchGate";
import { preparePipelineRun, prepareScriptRun } from "./prepareRun";
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
vi.mock("../pipelines/nextflowRequirement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../pipelines/nextflowRequirement")>()),
  getPipelineNextflowRequirement: vi.fn(async () => null),
}));

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
    vi.mocked(startRun).mockClear();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const run = (
    workflowName: string,
    res = fakeResponse(),
    extra: { workflowId?: string; resume?: boolean } = {}
  ) =>
    runNextflowWorkflow(
      {
        nextflowScript: "workflow {}",
        workflowName,
        settings: { outputDirectory: root, outputNaming: "same" } as never,
        ...extra,
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
    // The run id went out first; the failure ends the stream.
    expect(res.status).not.toHaveBeenCalled();
    expect(res.output).toMatch(/^N-WAVE run: \S+\n/);
    expect(res.output).toContain("Failed to setup workflow execution: boom");
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

  it("says which nf-core components it installs, after sending the run id", async () => {
    vi.mocked(prepareScriptRun).mockImplementation(async (_dirs, _path, _script, _options, install) => {
      install?.onInstall?.("nf-core/fastqc");
      install?.onInstall?.("nf-core/multiqc");
      return { hasNfCoreModules: true, useProcessDocker: true };
    });
    const res = await run("installs");
    expect(res.output).toMatch(
      /^N-WAVE run: \S+\nN-WAVE: installing nf-core\/fastqc …\nN-WAVE: installing nf-core\/multiqc …\n/
    );
  });

  it("stops its installs when cancelled, and counts as cancelled", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(prepareScriptRun).mockImplementation(async (_dirs, _path, _script, _options, install) => {
      signal = install?.signal;
      install?.onInstall?.("nf-core/fastqc");
      // A download that only ends when it is stopped.
      return new Promise((_, reject) => {
        install?.signal?.addEventListener("abort", () => reject(new Error("canceled")));
      });
    });
    const res = fakeResponse();
    const finished = run("stops", res);
    await vi.waitFor(() => expect(res.output).toContain("installing nf-core/fastqc"));
    getLiveRun(listRuns()[0]?.id ?? "")?.stop("cancelled");
    await finished;
    expect(signal?.aborted).toBe(true);
    expect(res.output).toContain("Execution cancelled");
    expect(res.output).not.toContain("Failed to setup");
    expect(startRun).not.toHaveBeenCalled();
    const [entry] = listRuns({ isLive: isRunLive });
    expect(entry?.status).toBe("cancelled");
    expect(isRunLive(entry?.id ?? "")).toBe(false);
  });

  it("can be cancelled while it waits for another run of its pipeline", async () => {
    vi.mocked(preparePipelineRun).mockReturnValue({ hasNfCoreModules: false, useProcessDocker: false } as never);
    // An earlier run of nf-core/rnaseq is still downloading it.
    const openEarlier = await passLaunchGate("nf-core/rnaseq");
    const res = fakeResponse();
    const finished = runNextflowWorkflow(
      {
        pipeline: { name: "rnaseq", version: "3.27.0", profiles: ["test", "docker"], params: {} },
        workflowName: "waits",
        settings: { outputDirectory: root, outputNaming: "same" } as never,
      },
      res as unknown as Response
    );
    await vi.waitFor(() => expect(res.output).toContain("waiting for another run"));
    getLiveRun(listRuns()[0]?.id ?? "")?.stop("cancelled");
    await finished;
    expect(res.output).toContain("Execution cancelled");
    expect(startRun).not.toHaveBeenCalled();

    // The gate still opens for later runs.
    openEarlier();
    const next = await passLaunchGate("nf-core/rnaseq");
    next();
  });

  it("ends normally when neither its log nor its history can be written", async () => {
    const openLog = fs.createWriteStream;
    // The log can't be opened (as on a full or broken disk).
    const createWriteStream = vi
      .spyOn(fs, "createWriteStream")
      .mockImplementationOnce(() => openLog("/proc/version/nwave-run.log"));
    vi.mocked(prepareScriptRun).mockResolvedValue({ hasNfCoreModules: false, useProcessDocker: false });
    vi.mocked(startRun).mockImplementationOnce(({ onOutput, onExit }) => {
      setTimeout(() => {
        onOutput("working\n");
        // Nor can the run history be written any more (its temporary file
        // can't be created).
        fs.mkdirSync(path.join(root, "data", `runs.json.${process.pid}.tmp`), { recursive: true });
        onExit({ code: 0, signal: null, stopReason: null, outputTail: "" });
      }, 20);
      return { stop: () => {} };
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await run("d");
    await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
    expect(res.output).toContain("working");
    expect(warn.mock.calls.map(([message]) => String(message))).toEqual(
      expect.arrayContaining([
        expect.stringContaining("can't be written"),
        expect.stringContaining("Could not record how run"),
      ]),
    );
    warn.mockRestore();
    createWriteStream.mockRestore();
    // What afterEach waits for (this run's log never opened).
    fs.writeFileSync(path.join(root, "same", RUN_LOG_FILE), "");
  });

  it("resumes in the folder of the workflow's last run, with logs of its own", async () => {
    vi.mocked(prepareScriptRun).mockResolvedValue({ hasNfCoreModules: false, useProcessDocker: false });
    vi.mocked(startRun).mockImplementation(({ onExit }) => {
      setTimeout(() => onExit({ code: 0, signal: null, stopReason: null, outputTail: "" }), 5);
      return { stop: () => {} };
    });
    const ended = async (res: ReturnType<typeof fakeResponse>) => {
      await vi.waitFor(() => expect(res.end).toHaveBeenCalled());
      return res;
    };

    // Nothing to resume yet: an ordinary run.
    const first = await ended(await run("e", fakeResponse(), { workflowId: "wf-e", resume: true }));
    expect(first.output).toContain("nothing to resume");
    // Nextflow leaves its cache, which a successful run moves into nextflow/.
    fs.mkdirSync(path.join(root, "same", "nextflow", ".nextflow"), { recursive: true });
    fs.writeFileSync(path.join(root, "same", "nextflow", ".nextflow", "history"), "");

    const second = await ended(await run("e", fakeResponse(), { workflowId: "wf-e", resume: true }));
    const [latest, earlier] = listRuns({ workflowId: "wf-e" });
    expect(second.output).toContain(`resuming run ${earlier?.id}`);
    expect(latest?.resumedFrom).toBe(earlier?.id);
    expect(fs.existsSync(path.join(root, "same_2"))).toBe(false);
    expect(vi.mocked(buildNextflowLaunch).mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        runDir: path.join(root, "same"),
        resume: true,
        nextflowLog: `nextflow/.nextflow.${latest?.id}.log`,
      })
    );
    await vi.waitFor(() =>
      expect(fs.readFileSync(path.join(root, "same", `nwave-run.${latest?.id}.log`), "utf8")).toContain(
        "resuming run"
      )
    );
    expect(fs.readFileSync(path.join(root, "same", RUN_LOG_FILE), "utf8")).not.toContain("resuming run");
    vi.mocked(startRun).mockReset();
  });
});
