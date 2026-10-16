import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveExecutionMode, shouldUseLocalNextflow } from "./nextflowLauncher";
import { MODULE_CONFIG_FILE, preparePipelineRun, prepareScriptRun } from "./prepareRun";
import {
  createRunDirectories,
  moveNextflowMetadata,
  writeInputFiles,
} from "./runDirectory";
import { describeRunExit } from "./runExit";
import { fillPlaceholders, rememberInputs } from "./singleProcess";

const limits = { cpus: 2, memory: "4.GB" } as never;

describe("describeRunExit", () => {
  const context = { limits, timeoutMs: 90 * 60_000, runDir: "/runs/flow_1" };

  it("reports success with where the results are", () => {
    expect(describeRunExit({ code: 0, stopReason: null, outputTail: "" }, context)).toEqual({
      output:
        "\nNextflow execution completed successfully\nResults available in: /runs/flow_1\n",
      status: "succeeded",
    });
  });

  it("reports a cancelled run", () => {
    expect(
      describeRunExit({ code: null, stopReason: "cancelled", outputTail: "" }, context)
    ).toEqual({ output: "\nExecution cancelled\n", status: "cancelled" });
  });

  it("explains a run stopped at its time limit", () => {
    const ending = describeRunExit(
      { code: null, stopReason: "timeout", outputTail: "" },
      context
    );
    expect(ending.status).toBe("failed");
    expect(ending.output).toContain("time limit of 90 minutes");
    expect(ending.output).toContain("Nextflow execution failed with exit code: timeout");
    expect(ending.summary).toBe("Stopped after the time limit of 90 minutes.");
  });

  it("names the resource problem behind a failure", () => {
    const ending = describeRunExit(
      {
        code: 1,
        stopReason: null,
        outputTail:
          "Process requirement exceeds available memory -- req: 8 GB; avail: 4 GB\n",
      },
      context
    );
    expect(ending.output).toContain("N-WAVE resource problem: A task needed 8 GB");
    expect(ending.output).toContain("Nextflow execution failed with exit code: 1");
    expect(ending.summary).toContain("A task needed 8 GB");
  });

  it("summarizes other failures from Nextflow's error", () => {
    const ending = describeRunExit(
      { code: 1, stopReason: null, outputTail: "ERROR ~ No such file: reads.fq\n" },
      context
    );
    expect(ending.output).not.toContain("resource problem");
    expect(ending.summary).toContain("No such file");
    expect(
      describeRunExit({ code: 2, stopReason: null, outputTail: "" }, context).summary
    ).toBe("Nextflow exited with code 2.");
  });
});

describe("run directories", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-run-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("creates the run's folders and writes its inputs", () => {
    const dirs = createRunDirectories(root, "flow_1");
    expect(dirs.main).toBe(path.join(root, "flow_1"));
    for (const dir of [dirs.workflow, dirs.inputs, dirs.results, dirs.nextflow]) {
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    }
    writeInputFiles(dirs.inputs, { "a.txt": "hello" });
    expect(fs.readFileSync(path.join(dirs.inputs, "a.txt"), "utf8")).toBe("hello");
  });

  it("moves Nextflow's metadata into nextflow/", () => {
    const dirs = createRunDirectories(root, "flow_2");
    fs.mkdirSync(path.join(dirs.main, ".nextflow"));
    fs.writeFileSync(path.join(dirs.main, ".nextflow.log"), "log");
    fs.writeFileSync(path.join(dirs.nextflow, ".nextflow.log"), "old");
    moveNextflowMetadata(dirs);
    expect(fs.existsSync(path.join(dirs.main, ".nextflow"))).toBe(false);
    expect(fs.statSync(path.join(dirs.nextflow, ".nextflow")).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(dirs.nextflow, ".nextflow.log"), "utf8")).toBe("log");
  });

  it("writes a script's config next to it, with Docker for its tasks if asked", async () => {
    const dirs = createRunDirectories(root, "flow_3");
    const scriptPath = path.join(dirs.workflow, "flow.nf");
    const prepared = await prepareScriptRun(
      dirs,
      scriptPath,
      "workflow {\n  println 'hi'\n}\n",
      { useDocker: true, resourceConfig: "process {\n  resourceLimits = [cpus: 2]\n}" }
    );
    expect(prepared).toEqual({ hasNfCoreModules: false, useProcessDocker: true });
    expect(fs.readFileSync(scriptPath, "utf8")).toContain("println 'hi'");
    const config = fs.readFileSync(path.join(dirs.main, MODULE_CONFIG_FILE), "utf8");
    expect(config).toContain("resourceLimits");
    expect(fs.readFileSync(path.join(dirs.workflow, MODULE_CONFIG_FILE), "utf8")).toBe(config);
  });

  it("writes a pipeline's params and limits", () => {
    const dirs = createRunDirectories(root, "flow_4");
    const prepared = preparePipelineRun(
      dirs,
      { name: "rnaseq", version: "3.27.0", profiles: ["docker"], params: { input: "x.csv" } },
      "limits"
    );
    expect(prepared).toEqual({ hasNfCoreModules: true, useProcessDocker: true });
    expect(JSON.parse(fs.readFileSync(path.join(dirs.main, "params.json"), "utf8"))).toEqual({
      input: "x.csv",
    });
    expect(fs.readFileSync(path.join(dirs.main, MODULE_CONFIG_FILE), "utf8")).toBe("limits\n");
  });
});

describe("Nextflow launcher", () => {
  it("reads the execution mode, unknown values meaning auto", () => {
    expect(resolveExecutionMode("DOCKER")).toBe("docker");
    expect(resolveExecutionMode("local")).toBe("local");
    expect(resolveExecutionMode(undefined)).toBe("auto");
    expect(resolveExecutionMode("hybrid")).toBe("auto");
  });

  it("uses a local Nextflow only when the mode allows it", async () => {
    const hasLocal = vi.fn(async () => true);
    expect(await shouldUseLocalNextflow("docker", hasLocal)).toBe(false);
    expect(await shouldUseLocalNextflow("local", hasLocal)).toBe(true);
    expect(hasLocal).not.toHaveBeenCalled();
    expect(await shouldUseLocalNextflow("auto", hasLocal)).toBe(true);
    expect(await shouldUseLocalNextflow("auto", async () => false)).toBe(false);
  });
});

describe("single process placeholders", () => {
  it("fills in a node's inputs, quoted", () => {
    rememberInputs("n1", [
      { name: "name", value: "O'Brien" },
      { name: "count", value: 3 },
    ]);
    expect(fillPlaceholders("echo $name $count $other", "n1")).toBe(
      "echo 'O'\\''Brien' '3' $other"
    );
    expect(fillPlaceholders("echo $name", "unknown")).toBe("echo $name");
  });
});
