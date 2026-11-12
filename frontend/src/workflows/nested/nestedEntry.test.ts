import { describe, expect, it } from "vitest";
import { minimapColor, RUN_STATUS_COLORS } from "../../components/canvas/CanvasMinimap";
import { NODE_KINDS } from "../nodeKinds";
import { nestedEntryOf } from "./nestedEntry";

describe("nestedEntryOf", () => {
  it("opens nf-core subworkflow nodes and Pipeline nodes, nothing else", () => {
    expect(
      nestedEntryOf({ type: "process", data: { nwaveNfCoreModuleId: "nf-core/subworkflows/bam_sort_stats_samtools" } }, "ALIAS"),
    ).toEqual({ source: { type: "nfcore", id: "nf-core/subworkflows/bam_sort_stats_samtools" }, path: ["ALIAS"] });
    expect(nestedEntryOf({ type: "pipeline", data: { pipelineName: "rnaseq", pipelineVersion: "3.27.0" } }, "x")).toEqual({
      source: { type: "pipeline", name: "rnaseq", version: "3.27.0", path: "main.nf" },
    });
    expect(nestedEntryOf({ type: "pipeline", data: { pipelineName: "rnaseq" } }, "x")).toBeNull();
    expect(nestedEntryOf({ type: "process", data: { nwaveNfCoreModuleId: "nf-core/fastqc" } }, "x")).toBeNull();
  });
});

describe("minimapColor", () => {
  const step = { id: "s", type: "process", data: { processType: "nfcore_fastqc" } };
  const input = { id: "i", type: "fileInput", data: {} };
  it("colors nodes by kind as in the legend, notes apart", () => {
    expect(minimapColor(step, {}, false)).toBe(NODE_KINDS.nfcore.color);
    expect(minimapColor(input, {}, false)).toBe(NODE_KINDS.input.color);
    expect(minimapColor({ id: "n", type: "note", data: {} }, {}, false)).not.toBe(NODE_KINDS.operator.color);
  });

  it("colors steps by what the run did while there is one", () => {
    expect(minimapColor(step, { s: { status: "failed" } }, true)).toBe(RUN_STATUS_COLORS.failed);
    expect(minimapColor(step, {}, true)).not.toBe(NODE_KINDS.nfcore.color);
    // Inputs keep their color: they don't run.
    expect(minimapColor(input, {}, true)).toBe(NODE_KINDS.input.color);
  });
});
