import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordRun } from "./runIndex";
import { clearWorkflowCache, measureWorkflowCache, WorkflowCacheInUseError } from "./workflowCache";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-cache-"));

const write = (file: string, content: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

describe("workflow cache", () => {
  beforeAll(() => {
    process.env.NWAVE_DATA_DIR = path.join(root, "data");
  });
  afterAll(() => {
    Reflect.deleteProperty(process.env, "NWAVE_DATA_DIR");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("measures and clears the work and cache folders of a workflow's runs", async () => {
    const dir = path.join(root, "flow_1");
    write(path.join(dir, "nextflow", "work", "ab", "cdef", "out.txt"), "12345");
    write(path.join(dir, ".nextflow", "history"), "123");
    write(path.join(dir, "results", "out.txt"), "results stay");
    write(path.join(dir, "inputs", "a.txt"), "inputs stay");
    // A staged input is a link; its target isn't counted.
    fs.symlinkSync(path.join(dir, "inputs", "a.txt"), path.join(dir, "nextflow", "work", "ab", "cdef", "a.txt"));
    recordRun("flow_1", dir, { workflowId: "wf-c" });
    recordRun("other_1", path.join(root, "other"), { workflowId: "wf-other" });

    const measured = await measureWorkflowCache("wf-c");
    expect(measured.folders).toBe(1);
    expect(measured.bytes).toBeGreaterThanOrEqual(8);
    expect(measured.bytes).toBeLessThan(8 + 200);

    await expect(clearWorkflowCache("wf-c", (id) => id === "flow_1")).rejects.toBeInstanceOf(
      WorkflowCacheInUseError
    );
    await clearWorkflowCache("wf-c", () => false);
    expect(await measureWorkflowCache("wf-c")).toEqual({ bytes: 0, folders: 0 });
    expect(fs.existsSync(path.join(dir, "results", "out.txt"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "inputs", "a.txt"))).toBe(true);
  });
});
