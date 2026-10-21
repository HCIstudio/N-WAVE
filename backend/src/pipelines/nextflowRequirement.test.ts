import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareNextflowVersions,
  getPipelineNextflowRequirement,
  parseNextflowRequirement,
  resolvePipelineNextflowVersion,
} from "./nextflowRequirement";

describe("pipeline Nextflow requirements", () => {
  it("reads manifest.nextflowVersion", () => {
    // As in nf-core/rnaseq 3.27.0's nextflow.config.
    expect(
      parseNextflowRequirement(
        "manifest {\n    name            = 'nf-core/rnaseq'\n    nextflowVersion = '!>=25.10.4'\n}",
      ),
    ).toBe("25.10.4");
    expect(parseNextflowRequirement('nextflowVersion = ">=24.04.2"')).toBe("24.04.2");
    expect(parseNextflowRequirement("manifest { name = 'x' }")).toBeNull();
  });

  it("compares versions numerically", () => {
    expect(compareNextflowVersions("25.04.4", "25.10.4")).toBeLessThan(0);
    expect(compareNextflowVersions("25.10.4", "25.10.4")).toBe(0);
    expect(compareNextflowVersions("26.04.0", "25.10.4")).toBeGreaterThan(0);
    expect(compareNextflowVersions("25.10", "25.10.0")).toBe(0);
  });

  it("raises the version only when the pipeline needs a newer one", () => {
    expect(resolvePipelineNextflowVersion("25.04.4", "25.10.4")).toBe("25.10.4");
    expect(resolvePipelineNextflowVersion("26.04.0", "25.10.4")).toBe("26.04.0");
    expect(resolvePipelineNextflowVersion("25.04.4", null)).toBe("25.04.4");
  });
});

describe("reading a pipeline's requirement", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("doesn't keep a proxy's page as the pipeline's config", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-requirement-"));
    vi.stubEnv("NWAVE_DATA_DIR", root);
    const get = vi.spyOn(axios, "get").mockResolvedValue({
      data: "<html>Access denied</html>",
      headers: { "content-type": "text/html" },
    });
    expect(await getPipelineNextflowRequirement("rnaseq", "3.27.0")).toBeNull();
    expect(fs.existsSync(path.join(root, "pipelines", "rnaseq", "3.27.0", "nextflow.config"))).toBe(false);

    // Asked again, it tries the download again and keeps the real config.
    get.mockResolvedValue({
      data: "manifest {\n  nextflowVersion = '!>=25.10.4'\n}\n",
      headers: { "content-type": "text/plain" },
    });
    expect(await getPipelineNextflowRequirement("rnaseq", "3.27.0")).toBe("25.10.4");
    expect(fs.existsSync(path.join(root, "pipelines", "rnaseq", "3.27.0", "nextflow.config"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
