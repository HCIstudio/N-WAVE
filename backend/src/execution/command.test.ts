import { describe, expect, it } from "vitest";
import {
  buildContainerNextflowCommand,
  buildLocalNextflowCommand,
  buildPipelineConfig,
  capMaxMemory,
  normalizeMaxCpus,
  resolveNextflowPlatform,
  resolveOutputName,
  sanitizeWorkflowName,
  shellQuote,
  toDockerHostVisiblePath,
} from "./command";

describe("shellQuote", () => {
  it("wraps values in single quotes", () => {
    expect(shellQuote("a b")).toBe("'a b'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's; rm -rf /")).toBe("'it'\\''s; rm -rf /'");
  });
});

describe("toDockerHostVisiblePath", () => {
  it("keeps POSIX paths", () => {
    expect(toDockerHostVisiblePath("/home/me/results")).toBe("/home/me/results");
  });

  it("maps Windows drive paths to the Docker Desktop host mount", () => {
    expect(toDockerHostVisiblePath("C:\\Users\\me\\results")).toBe(
      "/run/desktop/mnt/host/c/Users/me/results"
    );
  });
});

describe("sanitizeWorkflowName", () => {
  it("replaces unsafe characters", () => {
    expect(sanitizeWorkflowName("My flow/../x")).toBe("My_flow____x");
  });

  it("falls back to 'workflow' for empty names", () => {
    expect(sanitizeWorkflowName("")).toBe("workflow");
  });
});

describe("resolveOutputName", () => {
  const now = new Date("2026-03-04T05:06:07.000Z");

  it("expands every placeholder", () => {
    expect(
      resolveOutputName(
        "{workflow_name}-{process_name}-{date}-{timestamp}",
        "demo",
        now
      )
    ).toBe(`demo-demo-2026-03-04-${now.getTime()}`);
  });

  it("defaults to the workflow name", () => {
    expect(resolveOutputName(undefined, "demo", now)).toBe("demo");
    expect(resolveOutputName("", "demo", now)).toBe("demo");
  });
});

describe("capMaxMemory", () => {
  it.each([
    ["4 GB", "4 GB"],
    ["5GB", "5GB"],
    ["8GB", "5GB"],
    ["16 GB", "5GB"],
    ["512 MB", "512 MB"],
    [undefined, "4GB"],
  ])("%s -> %s", (input, expected) => {
    expect(capMaxMemory(input)).toBe(expected);
  });
});

describe("normalizeMaxCpus", () => {
  it.each([
    [8, 8],
    [0, 4],
    [-2, 1],
    [undefined, 4],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeMaxCpus(input)).toBe(expected);
  });
});

describe("resolveNextflowPlatform", () => {
  it.each([
    [undefined, "linux/amd64"],
    ["linux/arm64", "linux/arm64"],
    ["native", null],
    ["NATIVE", null],
    ["", null],
  ])("%s -> %s", (configured, expected) => {
    expect(resolveNextflowPlatform(configured)).toBe(expected);
  });
});

describe("buildLocalNextflowCommand", () => {
  it("builds a host nextflow invocation", () => {
    expect(
      buildLocalNextflowCommand({
        scriptPath: "workflow/demo.nf",
        withModuleConfig: false,
        maxCpus: 2,
        maxMemory: "4 GB",
      })
    ).toBe(
      "NXF_LOG_FILE=nextflow/.nextflow.log nextflow -log nextflow/.nextflow.log run ./workflow/demo.nf --outdir results --inputdir inputs --max_cpus 2 --max_memory '4 GB' -work-dir nextflow/work"
    );
  });

  it("passes the generated module config when present", () => {
    expect(
      buildLocalNextflowCommand({
        scriptPath: "workflow/demo.nf",
        withModuleConfig: true,
        maxCpus: 2,
        maxMemory: "4GB",
      })
    ).toContain("-c nwave_modules.config run ./workflow/demo.nf");
  });
});

describe("buildContainerNextflowCommand", () => {
  const base = {
    scriptPath: "workflow/demo.nf",
    withModuleConfig: false,
    maxCpus: 4,
    maxMemory: "4GB",
    platform: "linux/amd64",
    nextflowVersion: "25.04.4",
    workDir: "/app/results/demo",
  };

  it("attaches the backend volumes when process Docker is off", () => {
    const command = buildContainerNextflowCommand({
      ...base,
      mount: { type: "volumes-from", container: "nwave-backend" },
    });
    expect(command).toBe(
      "docker run --rm --platform 'linux/amd64' --volumes-from 'nwave-backend' -v /var/run/docker.sock:/var/run/docker.sock -e NXF_LOG_FILE=nextflow/.nextflow.log -w '/app/results/demo' 'nextflow/nextflow:25.04.4' nextflow -log nextflow/.nextflow.log run ./workflow/demo.nf --outdir results --inputdir inputs --max_cpus 4 --max_memory '4GB' -work-dir nextflow/work"
    );
  });

  it("bind-mounts the host results path when process Docker is on", () => {
    const command = buildContainerNextflowCommand({
      ...base,
      workDir: "/srv/results/demo",
      mount: { type: "bind", source: "/srv/results", target: "/srv/results" },
    });
    expect(command).toContain("-v '/srv/results:/srv/results'");
    expect(command).toContain("-w '/srv/results/demo'");
  });

  it("omits --platform for the native platform", () => {
    const command = buildContainerNextflowCommand({
      ...base,
      platform: null,
      mount: { type: "volumes-from", container: "nwave-backend" },
    });
    expect(command).toMatch(/^docker run --rm --volumes-from /);
  });

  it("quotes user-controlled values", () => {
    const command = buildContainerNextflowCommand({
      ...base,
      nextflowVersion: "1;touch /tmp/pwned",
      mount: { type: "volumes-from", container: "nwave-backend" },
    });
    expect(command).toContain("'nextflow/nextflow:1;touch /tmp/pwned'");
  });
});

describe("nf-core pipeline runs", () => {
  const pipeline = {
    name: "rnaseq",
    version: "3.27.0",
    profiles: ["test", "docker"],
    withParamsFile: true,
  };

  it("runs the pipeline with its profiles and params file", () => {
    expect(
      buildLocalNextflowCommand({
        scriptPath: "workflow/x.nf",
        pipeline,
        withModuleConfig: true,
        maxCpus: 4,
        maxMemory: "5GB",
      })
    ).toBe(
      "NXF_LOG_FILE=nextflow/.nextflow.log nextflow -log nextflow/.nextflow.log -c nwave_modules.config run 'nf-core/rnaseq' -r '3.27.0' -profile 'test,docker' -params-file params.json --outdir results -work-dir nextflow/work"
    );
    expect(
      buildContainerNextflowCommand({
        scriptPath: "workflow/x.nf",
        pipeline: { ...pipeline, profiles: ["docker"], withParamsFile: false },
        withModuleConfig: true,
        maxCpus: 4,
        maxMemory: "5GB",
        platform: null,
        nextflowVersion: "25.04.4",
        workDir: "/srv/results/run",
        mount: { type: "bind", source: "/srv/results", target: "/srv/results" },
      })
    ).toMatch(/run 'nf-core\/rnaseq' -r '3.27.0' -profile 'docker' --outdir results -work-dir nextflow\/work$/);
  });

  it("caps resources with process.resourceLimits", () => {
    expect(buildPipelineConfig(4, "5 GB")).toContain(
      "resourceLimits = [ cpus: 4, memory: '5GB' ]"
    );
    expect(buildPipelineConfig(2, "4GB'; x")).toContain("memory: '4GBx'");
  });
});
