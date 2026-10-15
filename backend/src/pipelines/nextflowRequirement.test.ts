import { describe, expect, it } from "vitest";
import {
  compareNextflowVersions,
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
