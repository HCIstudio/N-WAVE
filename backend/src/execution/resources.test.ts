import { describe, expect, it } from "vitest";
import {
  buildResourceLimitsConfig,
  DEFAULT_TIMEOUT_MINUTES,
  describeRunLimits,
  diagnoseResourceFailure,
  formatMemory,
  parseMemory,
  resolveResourceCeiling,
  resolveRunLimits,
  resolveTimeoutMs,
} from "./resources";

const GB = 1024 ** 3;
const host = { cpus: 16, memory: 64 * GB };

describe("memory amounts", () => {
  it.each([
    ["8 GB", 8 * GB],
    ["8.GB", 8 * GB],
    ["8GB", 8 * GB],
    ["8G", 8 * GB],
    ["1.5 TB", 1.5 * 1024 * GB],
    ["512 MB", 512 * 1024 ** 2],
    ["512", 512],
  ])("parses %s", (value, bytes) => {
    expect(parseMemory(value)).toBe(bytes);
  });

  it.each(["", "lots", "-4 GB", "4 XB", undefined])("rejects %j", (value) => {
    expect(parseMemory(value)).toBeNull();
  });

  it("formats in Nextflow notation, rounding down", () => {
    expect(formatMemory(12.7 * GB)).toBe("12.GB");
    expect(formatMemory(700 * 1024 ** 2)).toBe("700.MB");
  });
});

describe("resource ceiling", () => {
  it("defaults to all host CPUs and 80% of host memory", () => {
    expect(resolveResourceCeiling({}, host)).toEqual({
      cpus: 16,
      memory: Math.floor(64 * GB * 0.8),
      source: { cpus: "host", memory: "host" },
    });
  });

  it("uses NWAVE_MAX_CPUS and NWAVE_MAX_MEMORY", () => {
    expect(
      resolveResourceCeiling({ NWAVE_MAX_CPUS: "6", NWAVE_MAX_MEMORY: "20 GB" }, host)
    ).toEqual({ cpus: 6, memory: 20 * GB, source: { cpus: "env", memory: "env" } });
  });

  it("ignores invalid values", () => {
    expect(
      resolveResourceCeiling({ NWAVE_MAX_CPUS: "many", NWAVE_MAX_MEMORY: "big" }, host)
        .source
    ).toEqual({ cpus: "host", memory: "host" });
  });
});

describe("run limits", () => {
  const ceiling = resolveResourceCeiling({ NWAVE_MAX_MEMORY: "32 GB" }, host);

  it("allows more than 5 GB when the server allows it", () => {
    const limits = resolveRunLimits({ maxCpus: 8, maxMemory: "15 GB" }, ceiling);
    expect(limits).toMatchObject({
      cpus: 8,
      memory: "15.GB",
      capped: { cpus: false, memory: false },
    });
    expect(buildResourceLimitsConfig(limits)).toContain(
      "  resourceLimits = [ cpus: 8, memory: '15.GB' ]"
    );
  });

  it("clamps requests to the ceiling and says so", () => {
    const limits = resolveRunLimits({ maxCpus: 64, maxMemory: "128 GB" }, ceiling);
    expect(limits).toMatchObject({
      cpus: 16,
      memory: "32.GB",
      capped: { cpus: true, memory: true },
    });
    expect(describeRunLimits(limits, 90 * 60_000)).toBe(
      "N-WAVE limits: 16 CPUs, 32 GB memory, time limit 90 min (lowered CPUs to 16 and memory to 32.0 GB, the most this server allows; see NWAVE_MAX_CPUS / NWAVE_MAX_MEMORY)"
    );
  });

  it("defaults to 4 CPUs and 4 GB", () => {
    expect(resolveRunLimits({}, ceiling)).toMatchObject({ cpus: 4, memory: "4.GB" });
    expect(describeRunLimits(resolveRunLimits({}, ceiling), 0)).toBe(
      "N-WAVE limits: 4 CPUs, 4 GB memory, no time limit"
    );
  });
});

describe("time limits", () => {
  it("uses the run's limit, then NWAVE_EXECUTION_TIMEOUT, then 24 hours", () => {
    expect(resolveTimeoutMs(30, { NWAVE_EXECUTION_TIMEOUT: "5" })).toBe(30 * 60_000);
    expect(resolveTimeoutMs(0, { NWAVE_EXECUTION_TIMEOUT: "120" })).toBe(120 * 60_000);
    expect(resolveTimeoutMs(0, { NWAVE_EXECUTION_TIMEOUT: "0" })).toBe(0);
    expect(resolveTimeoutMs(undefined, {})).toBe(DEFAULT_TIMEOUT_MINUTES * 60_000);
    expect(resolveTimeoutMs(0, { NWAVE_EXECUTION_TIMEOUT: "soon" })).toBe(
      DEFAULT_TIMEOUT_MINUTES * 60_000
    );
  });
});

describe("diagnoseResourceFailure", () => {
  const limits = { cpus: 4, memory: "4.GB" };

  it("explains requirements Nextflow can't satisfy", () => {
    expect(
      diagnoseResourceFailure(
        "ERROR ~ Error executing process > 'STAR_ALIGN (1)'\nCaused by:\n  Process requirement exceeds available memory -- req: 36 GB; avail: 4 GB\n",
        limits
      )
    ).toBe(
      "A task needed 36 GB of memory, but only 4 GB was available. Raise Maximum CPU Cores / Maximum Memory in the execution settings (this run had 4 CPUs and 4 GB), or NWAVE_MAX_CPUS / NWAVE_MAX_MEMORY on the server."
    );
    expect(
      diagnoseResourceFailure(
        "Process requirement exceeds available CPUs -- req: 12; avail: 4"
      )
    ).toMatch(/^A task needed 12 CPUs, but only 4 were available\./);
  });

  it("recognises tasks killed for lack of memory", () => {
    for (const output of [
      "Command exit status:\n  137\n",
      "terminated with an error exit status (137)",
      "Exception in thread main java.lang.OutOfMemoryError: Java heap space",
    ]) {
      expect(diagnoseResourceFailure(output, limits)).toMatch(/ran out of memory/);
    }
  });

  it("stays quiet for other failures", () => {
    expect(diagnoseResourceFailure("Command exit status:\n  1\nNo such file")).toBeNull();
  });
});
